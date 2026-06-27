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

test("omits embedded image data URLs before checking text", async () => {
  const prepared = await prepareInput({
    text: "Useful text.\n[image1]: <data:image/png;base64,AAAA\nBBBB>\nMore useful text."
  });

  assert.match(prepared.text, /Useful text/);
  assert.match(prepared.text, /data:image;base64,\[omitted\]/);
  assert.doesNotMatch(prepared.text, /AAAA/);
  assert.deepEqual(prepared.warnings, ["Embedded image data URLs were omitted before checking."]);
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
    split: false,
    chunkCount: 1,
    chunks: [],
    sourceFile: null,
    textSource: "direct-text",
    convertedFile: null
  });
});

test("checkZeroGPTInput runs short text once", async () => {
  let calls = 0;
  await checkZeroGPTInput(
    { text: "Short text." },
    {
      detector: async () => {
        calls += 1;
        return {
          source: "zerogpt",
          verdict: "Your Text is Human written",
          aiPercentage: 0,
          wordCount: 2,
          characterCount: 11,
          notice: null,
          warnings: [],
          flagged: []
        };
      }
    }
  );

  assert.equal(calls, 1);
});

test("checkZeroGPTInput splits long text and aggregates chunk results", async () => {
  const input = `${"Human sentence. ".repeat(700)}\n\n${"Generated sentence. ".repeat(700)}`;
  const seenLengths = [];
  const result = await checkZeroGPTInput(
    { text: input },
    {
      detector: async (chunkText) => {
        seenLengths.push(chunkText.length);
        return {
          source: "zerogpt",
          verdict: "chunk verdict",
          aiPercentage: seenLengths.length === 1 ? 10 : 30,
          wordCount: 10,
          characterCount: chunkText.length,
          notice: null,
          warnings: [],
          flagged: [{ lineStart: 1, lineEnd: 1, snippet: chunkText.slice(0, 20) }]
        };
      }
    }
  );

  assert.ok(seenLengths.length > 1);
  assert.ok(seenLengths.every((length) => length <= 15000));
  assert.equal(result.split, true);
  assert.equal(result.chunkCount, seenLengths.length);
  assert.equal(result.chunks.length, seenLengths.length);
  assert.ok(Number.isFinite(result.aiPercentage));
  assert.ok(result.flagged.every((item) => Number.isFinite(item.lineStart)));
});

test("checkZeroGPTInput supports bounded chunk concurrency", async () => {
  const input = `${"Alpha sentence. ".repeat(800)}\n\n${"Beta sentence. ".repeat(800)}`;
  let active = 0;
  let maxActive = 0;

  await checkZeroGPTInput(
    { text: input },
    {
      concurrency: 2,
      detector: async (chunkText) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return {
          source: "zerogpt",
          verdict: "chunk verdict",
          aiPercentage: 10,
          wordCount: 10,
          characterCount: chunkText.length,
          notice: null,
          warnings: [],
          flagged: []
        };
      }
    }
  );

  assert.equal(maxActive, 2);
});

test("checkZeroGPTInput rejects invalid chunk concurrency", async () => {
  await assert.rejects(
    () =>
      checkZeroGPTInput(
        { text: `${"Alpha sentence. ".repeat(800)}\n\n${"Beta sentence. ".repeat(800)}` },
        {
          concurrency: 5,
          detector: async () => ({})
        }
      ),
    /--concurrency must be an integer from 1 to 4/
  );
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
