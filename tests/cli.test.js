import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli.js";

test("parseArgs keeps boolean flags from consuming the next option", () => {
  const parsed = parseArgs(["report", "--dry-run", "--input", "foo.csv", "--oid", "123"]);
  assert.equal(parsed.command, "report");
  assert.equal(parsed.options["dry-run"], true);
  assert.equal(parsed.options.input, "foo.csv");
  assert.equal(parsed.options.oid, "123");
});
