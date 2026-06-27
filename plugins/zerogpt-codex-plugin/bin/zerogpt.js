#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { detectWithZeroGPT, toCompactZeroGPTResult } from "../src/zerogpt.js";

const usage = `Usage:
  zerogpt --text "text to check" [--json] [--compact] [--headed]
  zerogpt --file ./input.txt [--json]
  cat input.txt | zerogpt --json

Options:
  --text <text>       Text to check.
  --file <path>       Read text from a file.
  --json              Print raw JSON.
  --compact           Print minimal single-line JSON. Useful for MCP/plugin calls.
  --debug             Include raw page text for selector debugging.
  --headed            Show the browser while running.
  --timeout <ms>      Maximum wait time. Default: 60000.
  --url <url>         ZeroGPT URL. Default: https://www.zerogpt.com/
  --help              Show this help.
`;

function parseArgs(argv) {
  const options = {
    json: false,
    compact: false,
    debug: false,
    headed: false,
    timeoutMs: 60000,
    url: "https://www.zerogpt.com/"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--compact") {
      options.json = true;
      options.compact = true;
    } else if (arg === "--debug") {
      options.debug = true;
    } else if (arg === "--headed") {
      options.headed = true;
    } else if (arg === "--text") {
      options.text = argv[++i];
    } else if (arg === "--file") {
      options.file = argv[++i];
    } else if (arg === "--timeout") {
      options.timeoutMs = Number(argv[++i]);
    } else if (arg === "--url") {
      options.url = argv[++i];
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive number of milliseconds");
  }

  return options;
}

async function readStdinIfPiped() {
  if (process.stdin.isTTY) return "";

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function getInputText(options) {
  const sources = [options.text, options.file].filter(Boolean).length;
  if (sources > 1) {
    throw new Error("Use only one input source: --text, --file, or stdin");
  }

  if (options.text) return options.text;
  if (options.file) return fs.readFile(options.file, "utf8");

  const stdin = await readStdinIfPiped();
  if (stdin.trim()) return stdin;

  throw new Error("No input text provided. Use --text, --file, or pipe stdin.");
}

function printTextResult(result) {
  const verdict = result.verdict ?? "Unknown verdict";
  const score = result.aiPercentage === null ? "unknown" : `${result.aiPercentage}%`;

  console.log(`Verdict: ${verdict}`);
  console.log(`AI score: ${score}`);
  if (result.notice) console.log(`Notice: ${result.notice}`);
  if (result.wordCount !== null) console.log(`Words: ${result.wordCount}`);
  if (result.characterCount !== null) console.log(`Characters: ${result.characterCount}`);
  if (result.flagged?.length) {
    console.log("Detected lines:");
    for (const item of result.flagged) {
      console.log(`- ${item.lineStart}-${item.lineEnd}: ${item.snippet}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }

  const text = await getInputText(options);
  const result = await detectWithZeroGPT(text, {
    headed: options.headed,
    includeRawText: options.debug,
    timeoutMs: options.timeoutMs,
    url: options.url
  });

  if (options.json) {
    const output = options.compact ? toCompactZeroGPTResult(result) : result;
    console.log(JSON.stringify(output, null, options.compact ? 0 : 2));
  } else {
    printTextResult(result);
  }
}

main().catch((error) => {
  console.error(`zerogpt: ${error.message}`);
  process.exitCode = 1;
});
