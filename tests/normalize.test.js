import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { runNormalizeCommand } from "../src/normalizer/normalizeComments.js";

test("normalize generates review csv with spam evidence", async () => {
  const inputPath = new URL("./fixtures-comments.jsonl", import.meta.url);
  const outputPath = new URL("./fixtures-output.csv", import.meta.url);
  await runNormalizeCommand({
    input: inputPath,
    out: outputPath
  });
  const content = await readFile(outputPath, "utf8");
  assert.match(content, /spam/);
  await rm(outputPath);
});
