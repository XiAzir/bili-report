import test from "node:test";
import assert from "node:assert/strict";
import { classifyRow, getRepeatCount } from "../src/annotator/labelSlices.js";

const EMPTY_STATS = {
  dedupeCounts: new Map(),
  urlCounts: new Map()
};

function createRow(overrides = {}) {
  return {
    content_raw: "",
    dedupe_key: "",
    picture_urls: "",
    ...overrides
  };
}

test("classifyRow marks explicit id sharing as doxxing", () => {
  const row = createRow({ content_raw: "回复 @xx :身份证私我马上发给你" });
  assert.equal(classifyRow(row, EMPTY_STATS), "doxxing");
});

test("classifyRow prefers abuse over spam", () => {
  const row = createRow({
    content_raw: "绿色懒狗权威认证",
    dedupe_key: "绿色懒狗权威认证"
  });
  const stats = {
    dedupeCounts: new Map([["绿色懒狗权威认证", 5]]),
    urlCounts: new Map()
  };
  assert.equal(classifyRow(row, stats), "abuse");
});

test("classifyRow marks generic patch notes as unrelated", () => {
  const row = createRow({ content_raw: "开发笔记：本次更新日志与当前动态内容无关" });
  assert.equal(classifyRow(row, EMPTY_STATS), "unrelated");
});

test("getRepeatCount detects repeated chunks in the middle of text", () => {
  assert.equal(getRepeatCount("前缀abcabcabc后缀"), 3);
});
