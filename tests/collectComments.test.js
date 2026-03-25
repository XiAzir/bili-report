import test from "node:test";
import assert from "node:assert/strict";
import { extractInitialState } from "../src/collector/collectComments.js";

test("extractInitialState parses balanced JSON even when strings contain brace-like content", () => {
  const html = `
    <script>
      window.__INITIAL_STATE__ = {"detail":{"basic":{"comment_id_str":"1","comment_type":11}},"text":"value }; still string","nested":{"value":{"ok":true}}};
    </script>
  `;
  const state = extractInitialState(html);
  assert.equal(state.detail.basic.comment_id_str, "1");
  assert.equal(state.nested.value.ok, true);
});
