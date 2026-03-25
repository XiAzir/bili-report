import { runCollectCommand } from "./collector/collectComments.js";
import { runNormalizeCommand } from "./normalizer/normalizeComments.js";
import { runAnnotateCommand } from "./normalizer/prepareAnnotation.js";
import { runReviewCommand } from "./reviewer/server.js";
import { runSliceCommand } from "./slicer/sliceComments.js";
import { runMergeApprovedCommand } from "./merger/mergeApproved.js";
import { runReportCommand } from "./reporter/submitReports.js";

const HELP_TEXT = `
Usage:
  node src/cli.js collect --url <dynamicUrl> --out <basePath> [--cookie-file <path>] [--mode 2|3] [--max-pages 300] [--delay-ms 800] [--debug-response]
  node src/cli.js normalize --input <jsonlPath> --out <csvPath>
  node src/cli.js slice --input <csvPath> [--out <dir>] [--size 200]
  node src/cli.js merge-approved [--slices-dir <dir>] [--out <csvPath>]
  node src/cli.js annotate --input <csvPath> --reason-map <path>
  node src/cli.js review --input <csvPath> [--port 4310] [--reason-map <path>]
  node src/cli.js report --input <csvPath> --oid <dynamicCommentId> [--cookie-file <path>] [--type 11] [--delay-ms 5000] [--dry-run]
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options[rawKey] = inlineValue;
      continue;
    }
    options[rawKey] = rest[index + 1] ?? true;
    index += 1;
  }
  return { command, options, positional };
}

function applyCommandDefaults(command, options, positional) {
  if (command === "collect") {
    return {
      ...options,
      url: options.url ?? positional[0],
      out: options.out ?? positional[1],
      mode: options.mode ?? positional[2],
      "max-pages": options["max-pages"] ?? positional[3],
      "delay-ms": options["delay-ms"] ?? positional[4],
      "cookie-file": options["cookie-file"]
    };
  }
  if (command === "normalize") {
    return {
      ...options,
      input: options.input ?? positional[0],
      out: options.out ?? positional[1]
    };
  }
  if (command === "annotate") {
    return {
      ...options,
      input: options.input ?? positional[0],
      "reason-map": options["reason-map"] ?? positional[1]
    };
  }
  if (command === "review") {
    return {
      ...options,
      input: options.input ?? positional[0],
      port: options.port ?? positional[1],
      "reason-map": options["reason-map"] ?? positional[2]
    };
  }
  if (command === "report") {
    return {
      ...options,
      input: options.input ?? positional[0],
      oid: options.oid ?? positional[1],
      "delay-ms": options["delay-ms"] ?? positional[2]
    };
  }
  if (command === "slice") {
    return {
      ...options,
      input: options.input ?? positional[0],
      out: options.out ?? positional[1],
      size: options.size ?? positional[2]
    };
  }
  if (command === "merge-approved") {
    return {
      ...options,
      "slices-dir": options["slices-dir"] ?? positional[0],
      out: options.out ?? positional[1]
    };
  }
  return options;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { command } = parsed;
  if (!command || command === "--help" || command === "help") {
    process.stdout.write(HELP_TEXT);
    return;
  }
  const options = applyCommandDefaults(command, parsed.options, parsed.positional);

  const commands = {
    collect: runCollectCommand,
    normalize: runNormalizeCommand,
    annotate: runAnnotateCommand,
    review: runReviewCommand,
    slice: runSliceCommand,
    "merge-approved": runMergeApprovedCommand,
    report: runReportCommand
  };

  const handler = commands[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }

  await handler(options);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
