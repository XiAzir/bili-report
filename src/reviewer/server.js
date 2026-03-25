import { createServer } from "node:http";
import { readTextFile, writeTextFile } from "../shared/fs.js";
import { parseCsv, toCsv } from "../shared/csv.js";
import { readJsonFile } from "../shared/json.js";
import { DEFAULT_REASONS, REVIEW_HEADERS, ensureAllowedReason } from "../shared/reasons.js";
import { renderHtml } from "./html.js";

function jsonResponse(response, payload, statusCode = 200) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function ensureOptions(options) {
  if (!options.input) {
    throw new Error("review requires --input <csvPath>");
  }
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_SIZE) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(JSON.parse(data || "{}")));
    request.on("error", reject);
  });
}

export async function runReviewCommand(options) {
  ensureOptions(options);
  const port = Number(options.port ?? 4310);
  const csvPath = options.input;
  const reasonMapPath = options["reason-map"];
  const allowedReasons = reasonMapPath
    ? (await readJsonFile(reasonMapPath)).allowedReasons ?? DEFAULT_REASONS
    : DEFAULT_REASONS;
  const rows = parseCsv(await readTextFile(csvPath));

  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderHtml());
      return;
    }

    if (request.method === "GET" && request.url === "/api/data") {
      jsonResponse(response, { rows, allowedReasons });
      return;
    }

    if (request.method === "POST" && request.url === "/api/row") {
      const payload = await parseBody(request);
      const idx = Number(payload.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= rows.length) {
        jsonResponse(response, { error: "Invalid index" }, 400);
        return;
      }
      ensureAllowedReason(payload.row.reason, allowedReasons);
      rows[idx] = {
        ...rows[idx],
        ...Object.fromEntries(REVIEW_HEADERS.map((header) => [header, payload.row[header] ?? ""]))
      };
      await writeTextFile(csvPath, toCsv(rows, REVIEW_HEADERS));
      jsonResponse(response, { ok: true, row: rows[idx] });
      return;
    }

    jsonResponse(response, { error: "Not Found" }, 404);
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  process.stdout.write(`Reviewer running at http://127.0.0.1:${port}\n`);
}
