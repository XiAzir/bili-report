import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

function resolvePath(filePath) {
  return filePath instanceof URL ? fileURLToPath(filePath) : filePath;
}

export async function ensureParentDir(filePath) {
  await mkdir(dirname(resolvePath(filePath)), { recursive: true });
}

export async function writeTextFile(filePath, content) {
  await ensureParentDir(filePath);
  await writeFile(resolvePath(filePath), content, "utf8");
}

export async function readTextFile(filePath) {
  return readFile(resolvePath(filePath), "utf8");
}
