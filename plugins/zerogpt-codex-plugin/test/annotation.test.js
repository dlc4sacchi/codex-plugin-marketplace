import test from "node:test";
import assert from "node:assert/strict";
import { annotateText, stripAiTags } from "../src/annotation.js";

test("stripAiTags removes existing ai tags and preserves inner text", () => {
  const stripped = stripAiTags("Clean <ai>flagged text</ai> remains.");

  assert.equal(stripped.text, "Clean flagged text remains.");
  assert.deepEqual(stripped.warnings, ["Existing <ai> tags were removed before checking."]);
});

test("annotateText wraps exact detected spans", () => {
  const annotated = annotateText("Alpha beta gamma.", [
    {
      startOffset: 6,
      endOffset: 10
    }
  ]);

  assert.equal(annotated, "Alpha <ai>beta</ai> gamma.");
});

test("annotateText merges overlapping ranges instead of nesting tags", () => {
  const annotated = annotateText("Alpha beta gamma.", [
    { startOffset: 6, endOffset: 10 },
    { startOffset: 8, endOffset: 16 }
  ]);

  assert.equal(annotated, "Alpha <ai>beta gamma</ai>.");
});

test("stripping then annotating an already annotated file does not nest tags", () => {
  const source = "Alpha <ai>beta</ai> gamma.";
  const stripped = stripAiTags(source);
  const annotated = annotateText(stripped.text, [{ startOffset: 6, endOffset: 10 }]);

  assert.equal(stripped.text, "Alpha beta gamma.");
  assert.equal(annotated, "Alpha <ai>beta</ai> gamma.");
  assert.doesNotMatch(annotated, /<ai>\s*<ai>/);
});
