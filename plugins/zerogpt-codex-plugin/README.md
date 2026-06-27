# ZeroGPT Codex Plugin

A Codex plugin skill backed by a small Node.js CLI that drives ZeroGPT through Playwright.

## Install

```bash
npm install
npx playwright install chromium
npm run check
npm test
```

## Use

```bash
npm run smoke
npm run smoke:lines
node ./bin/zerogpt.js --text "Paste text here" --json
node ./bin/zerogpt.js --text "Paste text here" --compact
node ./bin/zerogpt.js --file ./input.txt
cat input.txt | node ./bin/zerogpt.js --json
```

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
  "url": "https://www.zerogpt.com/",
  "inputLength": 147,
  "checkedAt": "2026-06-27T00:00:00.000Z",
  "verdict": "Your Text is Human written",
  "aiPercentage": 0,
  "wordCount": 23,
  "characterCount": 147,
  "notice": "Please input more text for a more accurate result",
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

## Add The Marketplace

In the Codex app, add this marketplace:

```text
Source: dlc4sacchi/codex-plugin-marketplace
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
