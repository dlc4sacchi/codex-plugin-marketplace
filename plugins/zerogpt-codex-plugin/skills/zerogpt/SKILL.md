---
name: zerogpt
description: Check text or files with ZeroGPT using the bundled Playwright CLI. Use when the user mentions ZeroGPT, AI detector, AI score, checking whether text is AI-generated, or asks which lines/sentences ZeroGPT detects.
---

# ZeroGPT

Use the bundled CLI from the plugin root:

```bash
node <plugin-root>/bin/zerogpt.js --help
```

Resolve `<plugin-root>` as the directory two levels above this `SKILL.md`.

## Workflow

- Use `--file <path> --json` for attached files or when the user asks for detected lines.
- Use `--text "<text>" --json` for short text in the prompt.
- Use `--compact` only when the user asks for a quick score, compact output, or token-efficient result.
- Summarize the result for the user. Include detected line ranges and snippets when `flagged` is non-empty.
- Do not include `rawText` unless troubleshooting selectors with `--debug`.

## Commands

```bash
node <plugin-root>/bin/zerogpt.js --file input.txt --json
node <plugin-root>/bin/zerogpt.js --file input.txt --compact
node <plugin-root>/bin/zerogpt.js --text "Text to check" --json
```
