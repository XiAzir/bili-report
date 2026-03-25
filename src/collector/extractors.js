import { getByPath } from "../shared/json.js";

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [String(value)];
}

function buildCommentRecord(comment, fields) {
  const record = {};
  for (const [outputField, sourcePath] of Object.entries(fields)) {
    const value = getByPath(comment, sourcePath);
    record[outputField] = outputField === "picture_urls" ? toStringArray(value).join("|") : value ?? "";
  }
  return record;
}

export function flattenComments(comments, fields, repliesPath, parentRootId = "") {
  const records = [];
  for (const comment of comments) {
    const record = buildCommentRecord(comment, fields);
    const rootId = parentRootId || record.root_comment_id || record.comment_id;
    records.push({
      ...record,
      root_comment_id: rootId
    });

    const replies = getByPath(comment, repliesPath) ?? [];
    if (Array.isArray(replies) && replies.length > 0) {
      records.push(...flattenComments(replies, fields, repliesPath, rootId));
    }
  }
  return records;
}
