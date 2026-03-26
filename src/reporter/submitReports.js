import { readTextFile, writeTextFile } from "../shared/fs.js";
import { parseCsv, toCsv } from "../shared/csv.js";
import { REVIEW_HEADERS, BILI_REASON_MAP } from "../shared/reasons.js";

const REPORT_API_URL = "https://api.bilibili.com/x/v2/reply/report";
const DEFAULT_DELAY_MS = 10000;
const DEFAULT_COOKIE_FILE = "config/bili-cookie.txt";

function extractCsrf(cookie) {
  const match = cookie.match(/bili_jct=([^;\s]+)/);
  if (!match) {
    throw new Error("Cookie 中找不到 bili_jct，无法获取 csrf token");
  }
  return match[1];
}

async function readCookie(cookieFile) {
  const content = await readTextFile(cookieFile);
  return content.trim();
}

function buildFormBody(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function submitReport({ cookie, csrf, oid, type, rpid, reasonId, reasonLabel }) {
  const body = buildFormBody({
    type,
    oid,
    rpid,
    reason: reasonId,
    content: reasonLabel,
    add_blacklist: "false",
    delete: "false",
    ordering: "time",
    statistics: JSON.stringify({ appId: 100, platform: 5 }),
    gaia_source: "main_web",
    csrf
  });

  const response = await fetch(REPORT_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
      referer: "https://www.bilibili.com/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    },
    body
  });

  const json = await response.json();
  return json;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureOptions(options) {
  if (!options.input) throw new Error("--input <csvPath> 是必填项");
  if (!options.oid) throw new Error("--oid <dynamicCommentId> 是必填项（动态评论区 ID，非评论 rpid）");
}

function markRowsReported(rows, rpid) {
  return rows.map((row) => (
    row.comment_id === rpid
      ? { ...row, status: "reported" }
      : row
  ));
}

export async function runReportCommand(options) {
  ensureOptions(options);

  const csvPath = options.input;
  const oid = options.oid;
  const commentType = options.type ?? "11";
  const delayMs = parseInt(options["delay-ms"] ?? DEFAULT_DELAY_MS, 10);
  const cookieFile = options["cookie-file"] ?? DEFAULT_COOKIE_FILE;
  const dryRun = options["dry-run"] === true || options["dry-run"] === "true";

  const cookie = process.env.BILI_COOKIE ?? (await readCookie(cookieFile));
  const csrf = extractCsrf(cookie);

  const content = await readTextFile(csvPath);
  const rows = parseCsv(content);

  const toReport = rows.filter((row) => row.status === "approved");
  process.stdout.write(`共 ${rows.length} 条记录，其中 ${toReport.length} 条 status=approved 待举报\n`);

  if (toReport.length === 0) {
    process.stdout.write("没有需要举报的记录。\n");
    return;
  }

  if (dryRun) {
    process.stdout.write("[dry-run] 以下是将要提交的举报（不实际发送）：\n");
    for (const row of toReport) {
      const reasonKey = row.reason;
      const biliReason = BILI_REASON_MAP[reasonKey];
      process.stdout.write(
        `  rpid=${row.comment_id} reason=${reasonKey}(${biliReason ? biliReason.id : "未知"}) uname=${row.uname}\n`
      );
    }
    return;
  }

  let successCount = 0;
  let skipCount = 0;
  const onProgress = options.onProgress ?? (() => {});

  for (let i = 0; i < toReport.length; i += 1) {
    const row = toReport[i];
    const rpid = row.comment_id;
    const reasonKey = row.reason;
    const biliReason = BILI_REASON_MAP[reasonKey];

    if (!biliReason) {
      process.stdout.write(`[跳过] rpid=${rpid} 未知 reason="${reasonKey}"\n`);
      skipCount += 1;
      continue;
    }

    if (!rpid) {
      process.stdout.write(`[跳过] 第 ${i} 行 comment_id 为空\n`);
      skipCount += 1;
      continue;
    }

    process.stdout.write(
      `[${i + 1}/${toReport.length}] 举报 rpid=${rpid} uname=${row.uname} reason=${reasonKey}(${biliReason.id})... `
    );

    try {
      const result = await submitReport({
        cookie,
        csrf,
        oid,
        type: commentType,
        rpid,
        reasonId: biliReason.id,
        reasonLabel: biliReason.label
      });

      if (result.code === 0) {
        const toast = result.data?.toast ?? "";
        process.stdout.write(`成功 ${toast ? `(${toast})` : ""}\n`);
        rows.splice(0, rows.length, ...markRowsReported(rows, rpid));
        successCount += 1;
      } else {
        process.stdout.write(`失败 code=${result.code} msg=${result.message}\n`);
        skipCount += 1;
      }
    } catch (error) {
      process.stdout.write(`错误 ${error.message}\n`);
      skipCount += 1;
    }
    onProgress(successCount, skipCount, toReport.length);

    if (i < toReport.length - 1) {
      await sleep(delayMs);
    }
  }

  // 回写 CSV
  await writeTextFile(csvPath, toCsv(rows, REVIEW_HEADERS));
  process.stdout.write(`\n完成：成功 ${successCount} 条，跳过 ${skipCount} 条。CSV 已回写。\n`);
}
