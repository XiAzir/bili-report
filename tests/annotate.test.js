import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm } from "node:fs/promises";
import { runAnnotateCommand } from "../src/normalizer/prepareAnnotation.js";

test("annotate rejects invalid reason", async () => {
  const csvPath = new URL("./annotate-invalid.csv", import.meta.url);
  const reasonMapPath = new URL("../config/reason-map.example.json", import.meta.url);
  await writeFile(
    csvPath,
    "comment_id,reason,manual_review,status\n1,invalid,pending,queued\n",
    "utf8"
  );
  await assert.rejects(
    runAnnotateCommand({
      input: csvPath,
      "reason-map": reasonMapPath
    }),
    /Invalid reason/
  );
  await rm(csvPath);
});
