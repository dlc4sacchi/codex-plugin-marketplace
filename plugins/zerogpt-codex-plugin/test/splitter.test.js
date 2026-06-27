import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { MAX_ZEROGPT_CHARS } from "../src/constants.js";
import { combineChunkResults, splitTextForZeroGPT } from "../src/splitter.js";

test("MAX_ZEROGPT_CHARS is 15000", () => {
  assert.equal(MAX_ZEROGPT_CHARS, 15000);
});

test("short text produces one chunk", () => {
  const chunks = splitTextForZeroGPT("Short text.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, "Short text.");
  assert.equal(chunks[0].inputLength, 11);
});

test("long text splits into non-empty chunks below the ZeroGPT limit", () => {
  const text = `${"A sentence about repairable laptops. ".repeat(300)}\n\n${"Another sentence about markets. ".repeat(300)}`;
  const chunks = splitTextForZeroGPT(text);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length > 0));
  assert.ok(chunks.every((chunk) => chunk.text.length <= MAX_ZEROGPT_CHARS));
  assert.equal(chunks.map((chunk) => chunk.text).join(" ").replace(/\s+/g, " ").trim(), text.replace(/\s+/g, " ").trim());
});

test("splitting prefers paragraph boundaries", () => {
  const first = "First paragraph sentence. ".repeat(200);
  const second = "Second paragraph sentence. ".repeat(200);
  const chunks = splitTextForZeroGPT(`${first}\n\n${second}`, {
    maxChars: Math.max(first.length, second.length) + 10
  });

  assert.equal(chunks.length, 2);
  assert.match(chunks[0].text, /^First paragraph/);
  assert.match(chunks[1].text, /^Second paragraph/);
});

test("combines chunk scores with character-weighted average and shifted lines", () => {
  const combined = combineChunkResults([
    {
      chunk: { index: 1, inputLength: 100, startLine: 1 },
      result: {
        url: "https://www.zerogpt.com/",
        aiPercentage: 10,
        verdict: "chunk one",
        wordCount: 10,
        characterCount: 100,
        notice: null,
        warnings: [],
        flagged: [{ lineStart: 2, lineEnd: 2, snippet: "first" }]
      }
    },
    {
      chunk: { index: 2, inputLength: 300, startLine: 20 },
      result: {
        url: "https://www.zerogpt.com/",
        aiPercentage: 30,
        verdict: "chunk two",
        wordCount: 30,
        characterCount: 300,
        notice: null,
        warnings: [],
        flagged: [{ lineStart: 1, lineEnd: 3, snippet: "second" }]
      }
    }
  ]);

  assert.equal(combined.aiPercentage, 25);
  assert.equal(combined.wordCount, 40);
  assert.equal(combined.characterCount, 400);
  assert.equal(combined.chunkCount, 2);
  assert.deepEqual(combined.flagged, [
    { lineStart: 2, lineEnd: 2, snippet: "first" },
    { lineStart: 20, lineEnd: 22, snippet: "second" }
  ]);
});

test("skill documents the 15000 character limit", async () => {
  const skill = await fs.readFile("skills/zerogpt/SKILL.md", "utf8");
  assert.match(skill, /15,000 characters/);
});
