import { createServer } from "node:http";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { readTextFile, writeTextFile } from "../shared/fs.js";
import { runCollectCommand } from "../collector/collectComments.js";
import { runNormalizeCommand } from "../normalizer/normalizeComments.js";
import { runSliceCommand } from "../slicer/sliceComments.js";
import { runMergeApprovedCommand } from "../merger/mergeApproved.js";
import { runReportCommand } from "../reporter/submitReports.js";
import { renderHtml } from "./html.js";

const DEFAULT_PORT = 4311;
const COOKIE_FILE = "config/bili-cookie.txt";
const MAX_BODY_SIZE = 10 * 1024 * 1024;

// 采集任务状态 Map: projectId -> { running, done, error, pages, count }
const collectJobs = new Map();
// 举报任务状态 Map: projectId -> { running, done, error, success, skip, total }
const reportJobs = new Map();

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function jsonResponse(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_SIZE) {
        req.destroy();
        reject(createHttpError("Request body too large", 413));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(createHttpError("Invalid JSON body", 400));
      }
    });
    req.on("error", reject);
  });
}

function extractProjectId(url) {
  const match = String(url ?? "").match(/opus\/(\d+)/);
  if (!match) throw new Error("无法从 URL 中提取动态 ID");
  return match[1];
}

function projectPaths(id) {
  return {
    raw: `data/${id}/raw/comments`,
    reviewCsv: `data/${id}/review/comments-review.csv`,
    slicesDir: `data/${id}/slices`,
    approvedCsv: `data/${id}/review/approved.csv`
  };
}

function parseRoute(url) {
  const [pathname, qs] = (url ?? "/").split("?", 2);
  const parts = pathname.split("/").filter(Boolean);
  return { parts, qs };
}

function validateProjectId(id, res) {
  if (!/^\d+$/.test(id)) {
    jsonResponse(res, { error: "Invalid project id" }, 400);
    return false;
  }
  return true;
}

async function handleGetCookie(res) {
  const content = await readTextFile(COOKIE_FILE).catch(() => "");
  jsonResponse(res, { cookie: content.trim() });
}

async function handleSaveCookie(req, res) {
  const body = await parseBody(req);
  await writeTextFile(COOKIE_FILE, String(body.cookie ?? ""));
  jsonResponse(res, { ok: true });
}

async function handleGetProjectConfig(id, res) {
  const configPath = `data/${id}/ui-config.json`;
  const content = await readTextFile(configPath).catch(() => null);
  const config = content ? JSON.parse(content) : {};
  jsonResponse(res, { id, paths: projectPaths(id), config });
}

async function handleSaveProjectConfig(id, req, res) {
  const body = await parseBody(req);
  const configPath = `data/${id}/ui-config.json`;
  await writeTextFile(configPath, JSON.stringify(body, null, 2));
  jsonResponse(res, { ok: true });
}

async function handleCollectStart(id, req, res) {
  const body = await parseBody(req);
  const paths = projectPaths(id);

  if (collectJobs.get(id)?.running) {
    jsonResponse(res, { error: "采集正在进行中" }, 409);
    return;
  }

  const job = { running: true, done: false, error: null, pages: 0, count: 0 };
  collectJobs.set(id, job);

  const cookie = await readTextFile(COOKIE_FILE).catch(() => "");
  const options = {
    url: body.url,
    out: paths.raw,
    "cookie-file": COOKIE_FILE,
    mode: String(body.mode ?? "2"),
    "max-pages": Number(body.maxPages ?? 300),
    "delay-ms": Number(body.delayMs ?? 800),
    onProgress(pages, count) {
      job.pages = pages;
      job.count = count;
    }
  };

  // 异步执行，不 await
  runCollectCommand(options).then(() => {
    job.running = false;
    job.done = true;
  }).catch((err) => {
    job.running = false;
    job.error = err.message;
  });

  jsonResponse(res, { ok: true, started: true });
}

async function handleCollectStatus(id, res) {
  const job = collectJobs.get(id);
  if (!job) {
    jsonResponse(res, { running: false, done: false, error: null, pages: 0, count: 0 });
    return;
  }
  jsonResponse(res, {
    running: job.running,
    done: job.done,
    error: job.error,
    pages: job.pages,
    count: job.count
  });
}

async function handleNormalize(id, res) {
  const paths = projectPaths(id);
  await runNormalizeCommand({
    input: `${paths.raw}.jsonl`,
    out: paths.reviewCsv
  });
  jsonResponse(res, { ok: true });
}

async function handleSlice(id, req, res) {
  const body = await parseBody(req);
  const paths = projectPaths(id);
  await runSliceCommand({
    input: paths.reviewCsv,
    out: paths.slicesDir,
    size: String(body.size ?? 200)
  });

  // 返回切片文件列表
  const files = await readdir(paths.slicesDir).catch(() => []);
  const slices = files.filter((f) => /^slice-\d+\.csv$/u.test(f)).sort();
  jsonResponse(res, { ok: true, slices });
}

async function handleMerge(id, res) {
  const paths = projectPaths(id);
  await runMergeApprovedCommand({
    "slices-dir": paths.slicesDir,
    out: paths.approvedCsv
  });
  jsonResponse(res, { ok: true, out: paths.approvedCsv });
}

async function handleSliceList(id, res) {
  const paths = projectPaths(id);
  const files = await readdir(paths.slicesDir).catch(() => []);
  const slices = files.filter((f) => /^slice-\d+\.csv$/u.test(f)).sort();
  jsonResponse(res, { slices });
}

async function handleReportStart(id, req, res) {
  const body = await parseBody(req);
  const paths = projectPaths(id);

  if (reportJobs.get(id)?.running) {
    jsonResponse(res, { error: "举报正在进行中" }, 409);
    return;
  }

  const job = { running: true, done: false, error: null, success: 0, skip: 0, total: 0 };
  reportJobs.set(id, job);

  const options = {
    input: paths.approvedCsv,
    oid: body.oid,
    "cookie-file": COOKIE_FILE,
    type: String(body.type ?? "11"),
    "delay-ms": Number(body.delayMs ?? 10000),
    "dry-run": body.dryRun ?? false,
    onProgress(success, skip, total) {
      job.success = success;
      job.skip = skip;
      job.total = total;
    }
  };

  runReportCommand(options).then(() => {
    job.running = false;
    job.done = true;
  }).catch((err) => {
    job.running = false;
    job.error = err.message;
  });

  jsonResponse(res, { ok: true, started: true });
}

async function handleReportStatus(id, res) {
  const job = reportJobs.get(id);
  if (!job) {
    jsonResponse(res, { running: false, done: false, error: null, success: 0, skip: 0, total: 0 });
    return;
  }
  jsonResponse(res, {
    running: job.running,
    done: job.done,
    error: job.error,
    success: job.success,
    skip: job.skip,
    total: job.total
  });
}

export async function runUiCommand(options) {
  const port = Number(options.port ?? DEFAULT_PORT);

  const server = createServer(async (req, res) => {
    try {
      await router(req, res);
    } catch (err) {
      jsonResponse(res, { error: err.message }, err.statusCode ?? 500);
    }
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  process.stdout.write(`UI running at http://127.0.0.1:${port}\n`);
}

async function router(req, res) {
  const { method } = req;
  const { parts } = parseRoute(req.url);

  // GET / → HTML
  if (method === "GET" && parts.length === 0) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderHtml());
    return;
  }

  // GET /api/cookie
  if (method === "GET" && parts[0] === "api" && parts[1] === "cookie") {
    await handleGetCookie(res);
    return;
  }

  // POST /api/cookie
  if (method === "POST" && parts[0] === "api" && parts[1] === "cookie") {
    await handleSaveCookie(req, res);
    return;
  }

  // /api/project/:id/*
  if (parts[0] === "api" && parts[1] === "project" && parts[2]) {
    const id = parts[2];
    if (!validateProjectId(id, res)) return;

    // GET /api/project/:id/config
    if (method === "GET" && parts[3] === "config") {
      await handleGetProjectConfig(id, res);
      return;
    }
    // POST /api/project/:id/config
    if (method === "POST" && parts[3] === "config") {
      await handleSaveProjectConfig(id, req, res);
      return;
    }
    // POST /api/project/:id/collect
    if (method === "POST" && parts[3] === "collect") {
      await handleCollectStart(id, req, res);
      return;
    }
    // GET /api/project/:id/collect/status
    if (method === "GET" && parts[3] === "collect" && parts[4] === "status") {
      await handleCollectStatus(id, res);
      return;
    }
    // POST /api/project/:id/normalize
    if (method === "POST" && parts[3] === "normalize") {
      await handleNormalize(id, res);
      return;
    }
    // POST /api/project/:id/slice
    if (method === "POST" && parts[3] === "slice") {
      await handleSlice(id, req, res);
      return;
    }
    // POST /api/project/:id/merge
    if (method === "POST" && parts[3] === "merge") {
      await handleMerge(id, res);
      return;
    }
    // GET /api/project/:id/slices
    if (method === "GET" && parts[3] === "slices") {
      await handleSliceList(id, res);
      return;
    }
    // POST /api/project/:id/report
    if (method === "POST" && parts[3] === "report") {
      await handleReportStart(id, req, res);
      return;
    }
    // GET /api/project/:id/report/status
    if (method === "GET" && parts[3] === "report" && parts[4] === "status") {
      await handleReportStatus(id, res);
      return;
    }
  }

  jsonResponse(res, { error: "Not Found" }, 404);
}
