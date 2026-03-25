import { readTextFile, writeTextFile } from "../shared/fs.js";
import { parseCsv, toCsv } from "../shared/csv.js";
import { REVIEW_HEADERS, ALLOWED_REASONS, ensureAllowedReason } from "../shared/reasons.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_SLICES_DIR = "data/slices";
const DEFAULT_OUT = "data/review/approved.csv";

export async function runMergeApprovedCommand(options) {
  const slicesDir = options["slices-dir"] ?? DEFAULT_SLICES_DIR;
  const outPath = options.out ?? DEFAULT_OUT;

  const files = (await readdir(slicesDir))
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .map((f) => join(slicesDir, f));

  if (files.length === 0) {
    process.stdout.write(`No CSV files found in ${slicesDir}\n`);
    return;
  }

  const approved = [];
  let totalScanned = 0;

  for (const filePath of files) {
    const rows = parseCsv(await readTextFile(filePath));
    totalScanned += rows.length;
    for (const row of rows) {
      if (row.reason && row.reason.trim() !== "") {
        ensureAllowedReason(row.reason.trim(), ALLOWED_REASONS);
        approved.push({ ...row, status: "approved" });
      }
    }
  }

  await writeTextFile(outPath, toCsv(approved, REVIEW_HEADERS));
  process.stdout.write(
    `Scanned ${totalScanned} rows across ${files.length} slices, ${approved.length} approved → ${outPath}\n`
  );
}
