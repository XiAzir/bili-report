import { writeTextFile, readTextFile } from "../shared/fs.js";
import { getByPath, stringifyJson } from "../shared/json.js";
import { toCsv, toJsonLines } from "../shared/csv.js";
import { flattenComments } from "./extractors.js";
import { createHash } from "node:crypto";

const BILI_COMMENT_API_URL = "https://api.bilibili.com/x/v2/reply/wbi/main";
const BILI_NAV_API_URL = "https://api.bilibili.com/x/web-interface/nav";
const BILI_SUB_REPLY_API_URL = "https://api.bilibili.com/x/v2/reply/reply";
const BILI_SUB_REPLY_PAGE_SIZE = 20;
const DEFAULT_MODE = "2";
const DEFAULT_MAX_PAGES = 300;
const DEFAULT_COOKIE_FILE = "config/bili-cookie.txt";
const DEFAULT_WEB_LOCATION = "1315875";
const DEFAULT_DELAY_MS = 0;
// WBI 混淆表：与 nav 接口返回的 img_key/sub_key 结合，用于生成 wts/w_rid 签名参数
// img_key 和 sub_key 在运行时通过 BILI_NAV_API_URL 动态获取，此常量为固定的字符位置混淆索引
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];
const RESPONSE_FIELDS = {
  comment_id: "rpid",
  root_comment_id: "root",
  reply_comment_id: "parent",
  uid: "member.mid",
  uname: "member.uname",
  ctime: "ctime",
  content_raw: "content.message",
  picture_urls: "content.pictures",
  like_count: "like",
  source_url: "jump_url"
};

function findInitialStateStart(html) {
  const marker = "window.__INITIAL_STATE__";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    return -1;
  }
  const equalsIndex = html.indexOf("=", markerIndex + marker.length);
  if (equalsIndex === -1) {
    return -1;
  }
  return html.indexOf("{", equalsIndex + 1);
}

function extractBalancedJsonObject(source, startIndex) {
  if (startIndex < 0 || source[startIndex] !== "{") {
    throw new Error("Initial state JSON object start not found");
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }
  throw new Error("Initial state JSON object is not balanced");
}

export function extractInitialState(html) {
  const objectStart = findInitialStateStart(html);
  if (objectStart === -1) {
    throw new Error("Cannot find window.__INITIAL_STATE__ in opus page");
  }
  return JSON.parse(extractBalancedJsonObject(html, objectStart));
}

function extractCommentContext(initialState) {
  const commentId = initialState?.detail?.basic?.comment_id_str;
  const commentType = initialState?.detail?.basic?.comment_type;
  if (!commentId || !commentType) {
    throw new Error("Cannot extract comment_id_str/comment_type from opus page state");
  }
  return {
    commentId: String(commentId),
    commentType: String(commentType),
    opusId: String(initialState?.id ?? initialState?.detail?.id_str ?? "")
  };
}

function summarizeResponseShape(pageData) {
  const topLevelKeys = Object.keys(pageData ?? {});
  const dataKeys = Object.keys(pageData?.data ?? {});
  return {
    code: pageData?.code,
    message: pageData?.message ?? pageData?.msg,
    topLevelKeys,
    dataKeys,
    cursorKeys: Object.keys(pageData?.data?.cursor ?? {}),
    firstReplyKeys: Object.keys(pageData?.data?.replies?.[0] ?? {}),
    firstItemKeys: Object.keys(pageData?.data?.items?.[0] ?? {})
  };
}

async function writeDebugResponse(options, pageData) {
  if (!options["debug-response"]) {
    return;
  }
  const debugPath = `${options.out}.debug-page-1.json`;
  await writeTextFile(debugPath, stringifyJson(pageData));
  process.stdout.write(`Debug response written to ${debugPath}\n`);
}

function buildUrl(baseUrl, queryParams) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function parseDynamicId(dynamicUrl) {
  const match = new URL(dynamicUrl).pathname.match(/(\d+)(?:\/)?$/);
  if (!match) {
    throw new Error(`Cannot parse dynamic id from url: ${dynamicUrl}`);
  }
  return match[1];
}

async function fetchCommentContext(dynamicUrl, cookie) {
  const response = await fetch(dynamicUrl, {
    headers: buildHeaders(dynamicUrl, cookie)
  });
  if (!response.ok) {
    throw new Error(`Fetch opus page failed: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  return extractCommentContext(extractInitialState(html));
}

async function resolveCookie(options) {
  if (process.env.BILI_COOKIE) {
    return process.env.BILI_COOKIE.trim();
  }
  const cookieFile = options["cookie-file"] ?? DEFAULT_COOKIE_FILE;
  return (await readTextFile(cookieFile)).trim();
}

function buildHeaders(dynamicUrl, cookie) {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "accept-encoding": "gzip, deflate, br",
    cookie,
    origin: "https://www.bilibili.com",
    referer: dynamicUrl,
    "sec-ch-ua": '"Chromium";v="134", "Google Chrome";v="134", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
  };
}

function extractWbiKey(url) {
  const pathname = new URL(url).pathname;
  const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
  return filename.split(".")[0];
}

function buildMixinKey(imgUrl, subUrl) {
  const keySource = `${extractWbiKey(imgUrl)}${extractWbiKey(subUrl)}`;
  return MIXIN_KEY_ENC_TAB.map((index) => keySource[index]).join("").slice(0, 32);
}

function sanitizeWbiValue(value) {
  return String(value).replace(/[!'()*]/g, "");
}

async function fetchWbiMixinKey(dynamicUrl, cookie) {
  const response = await fetch(BILI_NAV_API_URL, {
    headers: buildHeaders(dynamicUrl, cookie)
  });
  if (!response.ok) {
    throw new Error(`Fetch nav failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const imgUrl = data?.data?.wbi_img?.img_url;
  const subUrl = data?.data?.wbi_img?.sub_url;
  if (!imgUrl || !subUrl) {
    throw new Error("Cannot extract wbi_img keys from nav response");
  }
  return buildMixinKey(imgUrl, subUrl);
}

function resolveMode(options) {
  const mode = String(options.mode ?? DEFAULT_MODE);
  if (!["2", "3"].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use 2 for 最新评论 or 3 for 热门评论`);
  }
  return mode;
}

function resolveMaxPages(options) {
  const maxPages = Number(options["max-pages"] ?? DEFAULT_MAX_PAGES);
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error(`Invalid --max-pages value: ${options["max-pages"]}`);
  }
  return maxPages;
}

function resolveDelayMs(options) {
  const delayMs = Number(options["delay-ms"] ?? DEFAULT_DELAY_MS);
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error(`Invalid --delay-ms value: ${options["delay-ms"]}`);
  }
  return delayMs;
}

function shouldSaveRawPages(options) {
  return options["save-raw"] === true || options["save-raw"] === "true";
}

async function sleep(delayMs) {
  if (delayMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function buildSignedQuery(baseParams, mixinKey) {
  const params = {
    ...baseParams,
    wts: String(Math.floor(Date.now() / 1000))
  };
  const orderedPairs = Object.keys(params)
    .sort()
    .map((key) => [key, sanitizeWbiValue(params[key])]);
  const queryString = orderedPairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const wRid = createHash("md5").update(`${queryString}${mixinKey}`).digest("hex");
  return {
    ...Object.fromEntries(orderedPairs),
    w_rid: wRid
  };
}

function buildMainCommentQuery(commentId, commentType, mode, offset, mixinKey) {
  const baseParams = {
    mode,
    oid: commentId,
    plat: "1",
    type: commentType,
    web_location: DEFAULT_WEB_LOCATION
  };
  if (offset) {
    baseParams.pagination_str = JSON.stringify({ offset });
  }
  return buildSignedQuery(baseParams, mixinKey);
}

async function fetchPage(dynamicUrl, commentId, commentType, mode, cookie, offset, mixinKey) {
  const requestUrl = buildUrl(
    BILI_COMMENT_API_URL,
    buildMainCommentQuery(commentId, commentType, mode, offset, mixinKey)
  );
  const response = await fetch(requestUrl, {
    method: "GET",
    headers: buildHeaders(dynamicUrl, cookie)
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchSubReplyPage(dynamicUrl, commentId, commentType, rootCommentId, cookie, pageNumber) {
  const requestUrl = buildUrl(BILI_SUB_REPLY_API_URL, {
    oid: commentId,
    type: commentType,
    root: rootCommentId,
    pn: String(pageNumber),
    ps: String(BILI_SUB_REPLY_PAGE_SIZE)
  });
  const response = await fetch(requestUrl, {
    method: "GET",
    headers: buildHeaders(dynamicUrl, cookie)
  });
  if (!response.ok) {
    throw new Error(`Fetch sub replies failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function appendUniqueRows(targetRows, candidateRows, seenCommentIds) {
  for (const row of candidateRows) {
    if (seenCommentIds.has(row.comment_id)) {
      continue;
    }
    seenCommentIds.add(row.comment_id);
    targetRows.push(row);
  }
}

async function collectSubReplies(dynamicUrl, commentContext, cookie, topReplies, rows, seenCommentIds, delayMs) {
  for (const topReply of topReplies) {
    const totalReplies = Number(topReply?.rcount ?? 0);
    const loadedReplies = Array.isArray(topReply?.replies) ? topReply.replies.length : 0;
    if (totalReplies <= loadedReplies) {
      continue;
    }

    const totalPages = Math.ceil(totalReplies / BILI_SUB_REPLY_PAGE_SIZE);
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      await sleep(delayMs);
      const pageData = await fetchSubReplyPage(
        dynamicUrl,
        commentContext.commentId,
        commentContext.commentType,
        String(topReply.rpid),
        cookie,
        pageNumber
      );
      const subReplies = getByPath(pageData, "data.replies");
      if (!Array.isArray(subReplies)) {
        throw new Error(
          `Bilibili sub reply path data.replies is not an array: ${JSON.stringify(summarizeResponseShape(pageData))}`
        );
      }
      appendUniqueRows(
        rows,
        flattenComments(subReplies, RESPONSE_FIELDS, "replies", String(topReply.rpid)),
        seenCommentIds
      );
    }
  }
}

function ensureConfig(options) {
  if (!options.url || !options.out) {
    throw new Error("collect requires --url <dynamicUrl> --out <basePath>");
  }
}

export async function runCollectCommand(options) {
  ensureConfig(options);
  const dynamicUrl = options.url;
  parseDynamicId(dynamicUrl);
  const cookie = await resolveCookie(options);
  const commentContext = await fetchCommentContext(dynamicUrl, cookie);
  const mixinKey = await fetchWbiMixinKey(dynamicUrl, cookie);
  const mode = resolveMode(options);
  const maxPages = resolveMaxPages(options);
  const delayMs = resolveDelayMs(options);
  const pages = [];
  const rows = [];
  const seenCommentIds = new Set();
  let offset = "";

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    await sleep(delayMs);
    const pageData = await fetchPage(
      dynamicUrl,
      commentContext.commentId,
      commentContext.commentType,
      mode,
      cookie,
      offset,
      mixinKey
    );
    pages.push(pageData);
    if (pageIndex === 0) {
      await writeDebugResponse(options, pageData);
    }
    const comments = getByPath(pageData, "data.replies");
    if (!Array.isArray(comments)) {
      throw new Error(
        `Bilibili response path data.replies is not an array: ${JSON.stringify(summarizeResponseShape(pageData))}`
      );
    }
    appendUniqueRows(rows, flattenComments(comments, RESPONSE_FIELDS, "replies"), seenCommentIds);
    if (options.onProgress) {
      options.onProgress(pages.length, rows.length);
    }
    const hasMore = Boolean(getByPath(pageData, "data.cursor.is_end") === false);
    if (!hasMore) {
      break;
    }
    offset = getByPath(pageData, "data.cursor.pagination_reply.next_offset");
    if (!offset) {
      throw new Error("Bilibili cursor.pagination_reply.next_offset is missing");
    }
  }

  const topReplies = pages.flatMap((page) => getByPath(page, "data.replies") ?? []);
  await collectSubReplies(dynamicUrl, commentContext, cookie, topReplies, rows, seenCommentIds, delayMs);

  if (shouldSaveRawPages(options)) {
    await writeTextFile(`${options.out}.json`, stringifyJson(pages));
  }
  await writeTextFile(`${options.out}.jsonl`, toJsonLines(rows));
  await writeTextFile(`${options.out}.csv`, toCsv(rows));
  process.stdout.write(
    `Collected ${rows.length} comments to ${options.out}.jsonl (comment_id=${commentContext.commentId}, type=${commentContext.commentType}, mode=${mode}, pages=${pages.length}, delay_ms=${delayMs})\n`
  );
  return commentContext;
}
