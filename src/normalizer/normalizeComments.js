import { readTextFile, writeTextFile } from "../shared/fs.js";
import { parseJsonLines, toCsv } from "../shared/csv.js";
import { REVIEW_HEADERS } from "../shared/reasons.js";
import { DOXXING_PATTERNS, ABUSE_PATTERNS, FLAMEBAIT_PATTERNS, SHOCK_PATTERNS } from "../shared/patterns.js";
const SPAM_THRESHOLD = 3;

function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detectEvidenceTypes(text, pictureUrls) {
  const matches = [];
  if (DOXXING_PATTERNS.some((pattern) => pattern.test(text))) {
    matches.push("doxxing");
  }
  if (ABUSE_PATTERNS.some((pattern) => pattern.test(text))) {
    matches.push("abuse");
  }
  if (FLAMEBAIT_PATTERNS.some((pattern) => pattern.test(text))) {
    matches.push("hate_flamebait");
  }
  if (pictureUrls && SHOCK_PATTERNS.some((pattern) => pattern.test(text))) {
    matches.push("shock_image");
  }
  return matches;
}

function createDedupeKey(text) {
  return normalizeText(text).replace(/[^\p{Letter}\p{Number}\u4e00-\u9fa5]+/gu, "");
}

function countKeys(rows) {
  const counts = new Map();
  for (const row of rows) {
    const count = counts.get(row.dedupe_key) ?? 0;
    counts.set(row.dedupe_key, count + 1);
  }
  return counts;
}

function toReviewRow(row, counts) {
  const evidenceTypes = detectEvidenceTypes(row.content_normalized, row.picture_urls);
  const repeated = counts.get(row.dedupe_key) >= SPAM_THRESHOLD;
  if (repeated) {
    evidenceTypes.push("spam");
  }
  return {
    comment_id: row.comment_id ?? "",
    root_comment_id: row.root_comment_id ?? "",
    reply_comment_id: row.reply_comment_id ?? "",
    uid: row.uid ?? "",
    uname: row.uname ?? "",
    ctime: row.ctime ?? "",
    content_raw: row.content_raw ?? "",
    content_normalized: row.content_normalized,
    picture_urls: row.picture_urls ?? "",
    like_count: row.like_count ?? "",
    evidence_type: Array.from(new Set(evidenceTypes)).join("|"),
    reason: "",
    reason_confidence: "",
    manual_review: "pending",
    status: "queued",
    dedupe_key: row.dedupe_key,
    source_url: row.source_url ?? ""
  };
}

function ensureOptions(options) {
  if (!options.input || !options.out) {
    throw new Error("normalize requires --input <jsonlPath> --out <csvPath>");
  }
}

export async function runNormalizeCommand(options) {
  ensureOptions(options);
  const rawRows = parseJsonLines(await readTextFile(options.input));
  const normalizedRows = rawRows.map((row) => ({
    ...row,
    content_normalized: normalizeText(row.content_raw),
    dedupe_key: createDedupeKey(row.content_raw)
  }));
  const counts = countKeys(normalizedRows);
  const reviewRows = normalizedRows.map((row) => toReviewRow(row, counts));
  await writeTextFile(options.out, toCsv(reviewRows, REVIEW_HEADERS));
  process.stdout.write(`Normalized ${reviewRows.length} comments to ${options.out}\n`);
}
