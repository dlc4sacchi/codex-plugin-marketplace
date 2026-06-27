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
- Use `--file <path> --annotate --json` when the user wants a Markdown copy with ZeroGPT-detected spans wrapped in `<ai>...</ai>`.
- Use `--text "<text>" --json` for short text in the prompt.
- Use `--compact` only when the user asks for a quick score, compact output, or token-efficient result.
- ZeroGPT cannot process more than 15,000 characters per browser run; the CLI splits longer files automatically.
- Existing `<ai>` tags are removed before upload so re-checking annotated files does not change the score or create nested tags.
- For DOCX/PDF inputs, line numbers refer to the generated Markdown/text used for checking, not the original Word/PDF page layout.
- Use `--keep-temp` only when the user asks to inspect converted text.
- Summarize the result for the user. Include detected line ranges and snippets when `flagged` is non-empty.
- Do not include `rawText` unless troubleshooting selectors with `--debug`.

## Commands

```bash
node <plugin-root>/bin/zerogpt.js --file input.txt --json
node <plugin-root>/bin/zerogpt.js --file input.md --annotate --json
node <plugin-root>/bin/zerogpt.js --file input.txt --compact
node <plugin-root>/bin/zerogpt.js --file input.docx --json --keep-temp
node <plugin-root>/bin/zerogpt.js --text "Text to check" --json
```
