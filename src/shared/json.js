import { readFile } from "node:fs/promises";

export async function readJsonFile(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export function stringifyJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function getByPath(input, pathExpression) {
  if (!pathExpression) {
    return undefined;
  }

  return pathExpression.split(".").reduce((current, key) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[key];
  }, input);
}

export function setByPath(target, pathExpression, value) {
  const keys = pathExpression.split(".");
  let current = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys.at(-1)] = value;
}
