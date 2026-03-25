import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "../src/shared/csv.js";

test("csv roundtrip preserves quoted fields", () => {
  const content = toCsv([{ a: "x,y", b: 'z"q' }], ["a", "b"]);
  const rows = parseCsv(content);
  assert.deepEqual(rows, [{ a: "x,y", b: 'z"q' }]);
});
