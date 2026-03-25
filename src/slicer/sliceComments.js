import { readTextFile, writeTextFile } from "../shared/fs.js";
import { parseCsv, toCsv } from "../shared/csv.js";
import { REVIEW_HEADERS } from "../shared/reasons.js";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_SLICE_SIZE = 200;
const DEFAULT_OUT_DIR = "data/slices";

function ensureOptions(options) {
  if (!options.input) {
    throw new Error("slice requires --input <csvPath>");
  }
}

function resolveSliceSize(options) {
  const size = Number(options.size ?? DEFAULT_SLICE_SIZE);
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`Invalid slice size: ${options.size}`);
  }
  return size;
}

export async function runSliceCommand(options) {
  ensureOptions(options);
  const rows = parseCsv(await readTextFile(options.input));
  const sliceSize = resolveSliceSize(options);
  const outDir = options.out ?? DEFAULT_OUT_DIR;
  const total = rows.length;
  const totalSlices = Math.ceil(total / sliceSize);

  // 清理旧切片，避免旧数据在本次切片减少时残留
  const existingFiles = await readdir(outDir).catch(() => []);
  for (const file of existingFiles) {
    if (/^slice-\d+\.csv$/u.test(file)) {
      await unlink(join(outDir, file));
    }
  }

  for (let index = 0; index < totalSlices; index += 1) {
    const slice = rows.slice(index * sliceSize, (index + 1) * sliceSize);
    const padded = String(index + 1).padStart(3, "0");
    const outPath = `${outDir}/slice-${padded}.csv`;
    await writeTextFile(outPath, toCsv(slice, REVIEW_HEADERS));
    process.stdout.write(`Wrote ${slice.length} rows to ${outPath}\n`);
  }

  process.stdout.write(`Done: ${total} rows → ${totalSlices} slices in ${outDir}\n`);
}
