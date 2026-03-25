import { readTextFile, writeTextFile } from "../shared/fs.js";
import { parseCsv, toCsv } from "../shared/csv.js";
import { readJsonFile } from "../shared/json.js";
import { ALLOWED_REASONS, REVIEW_HEADERS, ensureAllowedReason } from "../shared/reasons.js";

function ensureOptions(options) {
  if (!options.input || !options["reason-map"]) {
    throw new Error("annotate requires --input <csvPath> --reason-map <path>");
  }
}

function normalizeReviewRow(row) {
  return {
    ...Object.fromEntries(REVIEW_HEADERS.map((header) => [header, row[header] ?? ""])),
    manual_review: row.manual_review || "pending",
    status: row.status || "queued"
  };
}

export async function runAnnotateCommand(options) {
  ensureOptions(options);
  const rows = parseCsv(await readTextFile(options.input)).map(normalizeReviewRow);
  const reasonMap = await readJsonFile(options["reason-map"]);
  const allowedReasons = reasonMap.allowedReasons ?? ALLOWED_REASONS;

  for (const row of rows) {
    ensureAllowedReason(row.reason, allowedReasons);
  }

  await writeTextFile(options.input, toCsv(rows, REVIEW_HEADERS));
  process.stdout.write(`Annotation file validated with ${allowedReasons.length} allowed reasons\n`);
}
