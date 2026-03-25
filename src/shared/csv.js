const LINE_BREAK = /\r?\n/;

function escapeCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll(`"`, `""`)}"`;
}

export function toCsv(rows, headers) {
  const allHeaders = headers ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [allHeaders.join(",")];
  for (const row of rows) {
    lines.push(allHeaders.map((header) => escapeCell(row[header] ?? "")).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function parseCsv(content) {
  content = content.replace(/^\uFEFF/, "");
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];
    if (char === `"` && inQuotes && nextChar === `"`) {
      current += `"`;
      index += 1;
      continue;
    }
    if (char === `"`) {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows.filter((item) => item.some((cell) => cell.length > 0));
  return dataRows.map((cells) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = cells[index] ?? "";
    });
    return entry;
  });
}

export function parseJsonLines(content) {
  return content
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function toJsonLines(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}
