import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCsv, toCsv } from "../shared/csv.js";
import { readTextFile, writeTextFile } from "../shared/fs.js";
import { REVIEW_HEADERS } from "../shared/reasons.js";
import { DOXXING_PATTERNS, ABUSE_PATTERNS, FLAMEBAIT_PATTERNS, UNRELATED_PATTERNS } from "../shared/patterns.js";

const DEFAULT_SLICES_DIR = "data/slices";
const MIN_SPAM_COUNT = 3;
const REPEATED_TEXT_THRESHOLD = 4;
const URL_SPAM_THRESHOLD = 3;
const REASON_PRIORITY = ["doxxing", "abuse", "hate_flamebait", "spam", "unrelated"];

function normalizeText(text) {
  return String(text ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

function compactText(text) {
  return normalizeText(text).replace(/[^\p{Letter}\p{Number}\u4e00-\u9fa5]+/gu, "");
}

function countRepeatedChunksAt(compact, start, size) {
  const chunk = compact.slice(start, start + size);
  if (!chunk) {
    return 1;
  }
  let count = 0;
  let cursor = start;
  while (compact.slice(cursor, cursor + size) === chunk) {
    count += 1;
    cursor += size;
  }
  return count;
}

export function getRepeatCount(compact) {
  let best = 1;
  for (let size = 2; size <= 12; size += 1) {
    for (let start = 0; start <= compact.length - size; start += 1) {
      best = Math.max(best, countRepeatedChunksAt(compact, start, size));
    }
  }
  return best;
}

function extractUrlKey(text) {
  const bvMatch = text.match(/BV[0-9A-Za-z]+/u);
  if (bvMatch) {
    return bvMatch[0].toLowerCase();
  }
  const urlMatch = text.match(/https?:\/\/\S+/u);
  return urlMatch ? urlMatch[0].toLowerCase() : "";
}

function buildStats(rows) {
  const dedupeCounts = new Map();
  const urlCounts = new Map();
  for (const row of rows) {
    const dedupeKey = row.dedupe_key || compactText(row.content_raw);
    dedupeCounts.set(dedupeKey, (dedupeCounts.get(dedupeKey) ?? 0) + 1);
    const urlKey = extractUrlKey(row.content_raw);
    if (urlKey) {
      urlCounts.set(urlKey, (urlCounts.get(urlKey) ?? 0) + 1);
    }
  }
  return { dedupeCounts, urlCounts };
}

function isDoxxing(text) {
  return DOXXING_PATTERNS.some((pattern) => pattern.test(text));
}

function isAbuse(text) {
  return ABUSE_PATTERNS.some((pattern) => pattern.test(text));
}

function isFlamebait(text) {
  return FLAMEBAIT_PATTERNS.some((pattern) => pattern.test(text));
}

function isSpam(row, stats) {
  const dedupeKey = row.dedupe_key || compactText(row.content_raw);
  const urlKey = extractUrlKey(row.content_raw);
  const repeatedText = getRepeatCount(compactText(row.content_raw)) >= REPEATED_TEXT_THRESHOLD;
  const duplicatedRow = (stats.dedupeCounts.get(dedupeKey) ?? 0) >= MIN_SPAM_COUNT;
  const duplicatedUrl = urlKey && (stats.urlCounts.get(urlKey) ?? 0) >= URL_SPAM_THRESHOLD;
  return repeatedText || duplicatedRow || duplicatedUrl;
}

function isUnrelated(text) {
  return UNRELATED_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyRow(row, stats) {
  const text = normalizeText(row.content_raw);
  if (!text && row.picture_urls) {
    return "shock_image";
  }
  const matched = [];
  if (isDoxxing(text)) {
    matched.push("doxxing");
  }
  if (isAbuse(text)) {
    matched.push("abuse");
  }
  if (isFlamebait(text)) {
    matched.push("hate_flamebait");
  }
  if (isSpam(row, stats)) {
    matched.push("spam");
  }
  if (isUnrelated(row.content_raw)) {
    matched.push("unrelated");
  }
  return REASON_PRIORITY.find((reason) => matched.includes(reason)) ?? "";
}

function annotateRows(rows) {
  const stats = buildStats(rows);
  return rows.map((row) => ({ ...row, reason: classifyRow(row, stats) }));
}

async function readSliceRows(filePath) {
  return parseCsv(await readTextFile(filePath));
}

async function writeSliceRows(filePath, rows) {
  await writeTextFile(filePath, toCsv(rows, REVIEW_HEADERS));
}

export async function runLabelSlices(options = {}) {
  const slicesDir = options.slicesDir ?? DEFAULT_SLICES_DIR;
  const files = (await readdir(slicesDir)).filter((file) => file.endsWith(".csv")).sort();
  const rowsByFile = [];
  for (const file of files) {
    const filePath = join(slicesDir, file);
    rowsByFile.push({ filePath, rows: await readSliceRows(filePath) });
  }
  const allRows = rowsByFile.flatMap((entry) => entry.rows);
  const annotatedRows = annotateRows(allRows);
  let cursor = 0;
  for (const entry of rowsByFile) {
    const nextRows = annotatedRows.slice(cursor, cursor + entry.rows.length);
    cursor += entry.rows.length;
    await writeSliceRows(entry.filePath, nextRows);
  }
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryHref === import.meta.url) {
  runLabelSlices().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
}
