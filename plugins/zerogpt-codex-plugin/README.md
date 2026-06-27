# ZeroGPT Codex Plugin

A Codex plugin skill backed by a small Node.js CLI that drives ZeroGPT through Playwright.

## Install

```bash
git clone https://github.com/dlc4sacchi/codex-plugin-marketplace.git
cd codex-plugin-marketplace/plugins/zerogpt-codex-plugin
npm install
npx playwright install chromium
npm link
zerogpt --help
npm run check
npm test
```

## Use

```bash
npm run smoke
npm run smoke:lines
npm run smoke:test-docs
node ./bin/zerogpt.js --text "Paste text here" --json
node ./bin/zerogpt.js --text "Paste text here" --compact
node ./bin/zerogpt.js --file ./input.txt
node ./bin/zerogpt.js --file ./paper.docx --json --keep-temp
node ./bin/zerogpt.js --file ./paper.pdf --json --temp-dir ./work/zerogpt
cat input.txt | node ./bin/zerogpt.js --json
```

Inputs longer than 15,000 characters are split into multiple ZeroGPT browser runs. Full JSON includes `split`, `chunkCount`, and compact `chunks[]` metadata; compact JSON stays score-only.
Use `--concurrency 2` for long files if you want faster chunk checks. Higher concurrency can make ZeroGPT more likely to rate-limit or stall, so the CLI caps it at 4 and defaults to 1.
`npm run smoke:test-docs` uses local files in `/home/saint/test docs` and the live ZeroGPT website, so it can be slow or drift as ZeroGPT changes.

For local global-style use:

```bash
npm link
zerogpt --text "Paste text here" --json
```

## Output

JSON output is designed to be easy to wrap from an MCP server or Codex plugin:

```json
{
  "source": "zerogpt",
  "sourceFile": "/path/to/paper.docx",
  "textSource": "generated-markdown",
  "convertedFile": null,
  "url": "https://www.zerogpt.com/",
  "inputLength": 147,
  "checkedAt": "2026-06-27T00:00:00.000Z",
  "verdict": "Your Text is Human written",
  "aiPercentage": 0,
  "wordCount": 23,
  "characterCount": 147,
  "notice": "Please input more text for a more accurate result",
  "warnings": [],
  "flagged": [
    {
      "lineStart": 3,
      "lineEnd": 5,
      "snippet": "Framework Computer is a small computer company..."
    }
  ]
}
```

Use `--compact` for token-efficient single-line JSON:

```json
{"verdict":"Your Text is Human written","aiPercentage":0,"wordCount":23,"characterCount":147,"notice":"Please input more text for a more accurate result"}
```

Use `--debug` only when selectors break; it includes raw page text and costs more tokens.

DOCX and embedded-text PDF files are converted to Markdown-ish text before checking. Line numbers for converted files refer to that generated text, not Word/PDF page layout. Converted temp files are deleted by default; pass `--keep-temp` to preserve them.

## Add The Marketplace

In the Codex app, add this marketplace:

```text
Source: dlc4sacchi/codex-plugin-marketplace
Source URL: https://github.com/dlc4sacchi/codex-plugin-marketplace.git
Git ref: main
Sparse paths: leave blank
```

Then install `zerogpt-codex-plugin` and start a new thread.

## Reuse From MCP Or A Codex Plugin

The CLI has a library boundary:

```js
import { detectWithZeroGPT } from "./src/zerogpt.js";

const result = await detectWithZeroGPT("Text to check", {
  timeoutMs: 60000,
  headed: false
});
```

For an MCP server, expose one tool such as `detect_ai_text` and call `detectWithZeroGPT`.
For a Codex plugin, keep this package as the implementation dependency and define a skill or MCP tool that shells out to:

```bash
node ./bin/zerogpt.js --json --text "$TEXT"
```

## Notes

ZeroGPT also advertises a paid API. If you later get API access, prefer the official API for production use. This Playwright wrapper is useful for personal automation and prototyping, but browser flows can break when the site changes.
