import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Document, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";
import { checkZeroGPTInput } from "../src/zerogpt.js";
import { prepareInput } from "../src/input.js";

test("reads plain text files as original-file input", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zgpt-text-"));
  const file = path.join(dir, "paper.md");
  await fs.writeFile(file, "# Title\n\nA plain text body.", "utf8");

  try {
    const prepared = await prepareInput({ file });
    assert.equal(prepared.text, "# Title\n\nA plain text body.");
    assert.equal(prepared.sourceFile, file);
    assert.equal(prepared.textSource, "original-file");
    assert.equal(prepared.convertedFile, null);
    await prepared.cleanup();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("accepts stdin as an input source", async () => {
  const prepared = await prepareInput({ stdin: "Text from stdin\n" });
  assert.equal(prepared.text, "Text from stdin");
  assert.equal(prepared.textSource, "stdin");
});

test("extracts DOCX to generated markdown and cleans temp files by default", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zgpt-docx-"));
  const tempDir = path.join(dir, "tmp");
  const file = path.join(dir, "paper.docx");
  const doc = new Document({
    sections: [{ children: [new Paragraph("Framework laptops are repairable.")] }]
  });
  await fs.writeFile(file, await Packer.toBuffer(doc));

  const prepared = await prepareInput({ file, tempDir });
  assert.match(prepared.text, /Framework laptops are repairable/);
  assert.equal(prepared.textSource, "generated-markdown");
  assert.equal(prepared.convertedFile, null);
  assert.equal((await fs.readdir(tempDir)).length, 1);

  await prepared.cleanup();
  assert.deepEqual(await fs.readdir(tempDir), []);
  await fs.rm(dir, { recursive: true, force: true });
});

test("preserves converted temp file with --keep-temp", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zgpt-keep-"));
  const tempDir = path.join(dir, "tmp");
  const file = path.join(dir, "paper.docx");
  const doc = new Document({
    sections: [{ children: [new Paragraph("Keep this generated text.")] }]
  });
  await fs.writeFile(file, await Packer.toBuffer(doc));

  const prepared = await prepareInput({ file, tempDir, keepTemp: true });
  assert.ok(prepared.convertedFile);
  assert.match(await fs.readFile(prepared.convertedFile, "utf8"), /Keep this generated text/);

  await prepared.cleanup();
  assert.match(await fs.readFile(prepared.convertedFile, "utf8"), /Keep this generated text/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("extracts embedded text from PDF", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zgpt-pdf-"));
  const file = path.join(dir, "paper.pdf");
  await writePdf(file, "Embedded PDF text for ZeroGPT.");

  const prepared = await prepareInput({ file, tempDir: path.join(dir, "tmp") });
  assert.match(prepared.text, /Embedded PDF text for ZeroGPT/);
  assert.equal(prepared.textSource, "generated-markdown");

  await prepared.cleanup();
  await fs.rm(dir, { recursive: true, force: true });
});

test("returns a clear error for image-only PDFs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zgpt-scan-"));
  const file = path.join(dir, "scan.pdf");
  await writePdf(file, "");

  await assert.rejects(
    () => prepareInput({ file, tempDir: path.join(dir, "tmp") }),
    /PDF appears to be scanned or image-only; OCR is not supported yet\./
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test("rejects unsupported binary formats", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zgpt-bin-"));
  const file = path.join(dir, "slides.pptx");
  await fs.writeFile(file, Buffer.from([0, 1, 2, 3]));

  await assert.rejects(() => prepareInput({ file }), /Unsupported binary file format: \.pptx/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("checkZeroGPTInput returns full JSON metadata with detector stub", async () => {
  const result = await checkZeroGPTInput(
    { text: "One line.\nSecond line." },
    {
      detector: async () => ({
        source: "zerogpt",
        verdict: "Your Text is Human written",
        aiPercentage: 0,
        wordCount: 4,
        characterCount: 22,
        notice: null,
        warnings: [],
        flagged: []
      })
    }
  );

  assert.deepEqual(result, {
    source: "zerogpt",
    verdict: "Your Text is Human written",
    aiPercentage: 0,
    wordCount: 4,
    characterCount: 22,
    notice: null,
    warnings: [],
    flagged: [],
    sourceFile: null,
    textSource: "direct-text",
    convertedFile: null
  });
});

test("CLI rejects mixed input sources before browser automation", () => {
  const result = spawnSync(
    process.execPath,
    ["bin/zerogpt.js", "--text", "x", "--file", "paper.txt", "--compact"],
    { cwd: path.resolve("."), encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Use only one input source/);
});

async function writePdf(file, text) {
  const doc = new PDFDocument();
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const done = new Promise((resolve) => doc.on("end", resolve));
  if (text) doc.text(text);
  doc.end();
  await done;

  await fs.writeFile(file, Buffer.concat(chunks));
}
