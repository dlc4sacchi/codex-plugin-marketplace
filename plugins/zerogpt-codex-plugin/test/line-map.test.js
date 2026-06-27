import test from "node:test";
import assert from "node:assert/strict";
import { mapHighlightedText, normalizeText } from "../src/line-map.js";
import { toCompactZeroGPTResult } from "../src/zerogpt.js";

test("normalizeText collapses ZeroGPT-style spacing", () => {
  assert.equal(normalizeText("Framework\u00a0Computer\n\n is   modular"), "Framework Computer is modular");
});

test("maps an exact highlighted paragraph to source lines", () => {
  const input = [
    "# Title",
    "",
    "Framework Computer is a small computer company built around a pretty direct idea: a laptop",
    "should be something the user can fix and change, not a sealed box that becomes a problem when",
    "one part fails.",
    "",
    "This sentence is not flagged."
  ].join("\n");

  const flagged = mapHighlightedText(input, [
    "Framework Computer is a small computer company built around a pretty direct idea: a laptop should be something the user can fix and change, not a sealed box that becomes a problem when one part fails."
  ]);

  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].lineStart, 3);
  assert.equal(flagged[0].lineEnd, 5);
  assert.match(flagged[0].snippet, /^Framework Computer is a small computer company/);
});

test("maps highlights when ZeroGPT collapses visual wrapping and spaces", () => {
  const input = [
    "The broad laptop and PC market is best classified as an oligopoly, more specifically a",
    "differentiated oligopoly. The numbers show why. Gartner reported that in 2025 Lenovo had 27.2",
    "percent of worldwide PC shipments, HP 21.3 percent, Dell 15.3 percent, Apple 9.2 percent, ASUS",
    "6.9 percent, and Acer 6.3 percent."
  ].join("\n");

  const flagged = mapHighlightedText(input, [
    "Gartner reported that in 2025 Lenovo had 27.2 percent of worldwide PC shipments, HP 21.3 percent, Dell 15.3 percent, Apple 9.2 percent, ASUS 6.9 percent, and Acer 6.3 percent."
  ]);

  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].lineStart, 2);
  assert.equal(flagged[0].lineEnd, 4);
});

test("maps highlights when ZeroGPT changes spacing around punctuation", () => {
  const input = "Framework sells control : repairability , Linux support , and upgrades.";
  const flagged = mapHighlightedText(input, [
    "Framework sells control: repairability, Linux support, and upgrades."
  ]);

  assert.deepEqual(flagged, [
    {
      lineStart: 1,
      lineEnd: 1,
      snippet: "Framework sells control: repairability, Linux support, and upgrades."
    }
  ]);
});

test("returns unmapped highlights with null lines", () => {
  const flagged = mapHighlightedText("Only original text.", ["Missing highlighted sentence."]);

  assert.deepEqual(flagged, [
    {
      lineStart: null,
      lineEnd: null,
      snippet: "Missing highlighted sentence."
    }
  ]);
});

test("uses the next duplicate occurrence for repeated flagged text", () => {
  const input = [
    "Repeated sentence appears here.",
    "A clean sentence.",
    "Repeated sentence appears here."
  ].join("\n");

  const flagged = mapHighlightedText(input, [
    "Repeated sentence appears here.",
    "Repeated sentence appears here."
  ]);

  assert.deepEqual(
    flagged.map((item) => item.lineStart),
    [1, 3]
  );
});

test("compact result excludes flagged lines and metadata", () => {
  const compact = toCompactZeroGPTResult({
    source: "zerogpt",
    url: "https://www.zerogpt.com/",
    checkedAt: "2026-06-27T00:00:00.000Z",
    verdict: "Your Text is Human written",
    aiPercentage: 0,
    wordCount: 23,
    characterCount: 147,
    notice: null,
    flagged: [{ lineStart: 1, lineEnd: 1, snippet: "x" }]
  });

  assert.deepEqual(compact, {
    verdict: "Your Text is Human written",
    aiPercentage: 0,
    wordCount: 23,
    characterCount: 147,
    notice: null
  });
});
