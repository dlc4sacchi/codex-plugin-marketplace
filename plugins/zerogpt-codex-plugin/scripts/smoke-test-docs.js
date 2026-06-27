#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { checkZeroGPTInput } from "../src/zerogpt.js";
import { normalizeText } from "../src/line-map.js";

const TOLERANCE = 0.5;
const TEST_DOCS_DIR = "/home/saint/test docs";
const STRICT = process.env.STRICT_ZEROGPT_FIXTURE_EXPECTATIONS === "1";

const cases = [
  {
    label: "finance",
    file: "finance_stock_market_report_final.pdf",
    expectedAiPercentage: 4.9,
    snippets: [
      "Submission Date - 27-06-2026 Academic Year 2025/2026 Semester: Summer 2025/2026 I/We hereby certify that this paper is the result of my/our own work and that all",
      "ChatGPT was used for drafting and editing support, and the final wording was reviewed for clarity and consistency with the chosen strategy."
    ]
  },
  {
    label: "religion",
    file: "How_Digital_Technology_Shapes_Modern_Religious_Identity.docx",
    expectedAiPercentage: 19.8,
    snippets: [
      "I grew up Hindu in a Muslim-majority community in Bangladesh, attended a Catholic school, and discovered Buddhism on a phone screen at two in the morning.",
      "Consider what exists now: Muslim Pro tracks prayer times and points you toward Mecca."
    ]
  },
  {
    label: "framework-md",
    file: "Framework Computer Microeconomics Analysis.md",
    expectedAiPercentage: 68.4,
    strictPercentage: true,
    snippets: []
  }
];

for (const testCase of cases) {
  const file = path.join(TEST_DOCS_DIR, testCase.file);
  const result = await checkZeroGPTInput({ file }, { timeoutMs: 120000, concurrency: 2 });
  const percentage = result.aiPercentage;
  const firstChunkPercentage = result.chunks?.[0]?.aiPercentage ?? percentage;
  const delta = Math.abs(firstChunkPercentage - testCase.expectedAiPercentage);

  console.log(
    `${testCase.label}: combined ${percentage}%, first chunk ${firstChunkPercentage}% (${result.chunkCount} chunk${result.chunkCount === 1 ? "" : "s"})`
  );

  if (delta > TOLERANCE) {
    const message = `${testCase.label} first chunk expected about ${testCase.expectedAiPercentage}% but got ${firstChunkPercentage}%`;
    if (STRICT || testCase.strictPercentage) fail(message);
    console.warn(`warning: ${message}`);
  }

  const flaggedText = normalizeText((result.flagged ?? []).map((item) => item.snippet).join(" "));
  for (const snippet of testCase.snippets) {
    if (!flaggedText.includes(normalizeText(snippet).slice(0, 80))) {
      const message = `${testCase.label} missing expected flagged snippet: ${snippet.slice(0, 80)}...`;
      if (STRICT) fail(message);
      console.warn(`warning: ${message}`);
    }
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
