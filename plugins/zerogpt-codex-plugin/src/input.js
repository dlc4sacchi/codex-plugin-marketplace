import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml"
]);

const UNSUPPORTED_BINARY_EXTENSIONS = new Set([
  ".pptx",
  ".xlsx",
  ".xls",
  ".ppt",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".mp3",
  ".wav",
  ".mp4",
  ".mov",
  ".avi",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz"
]);

export async function checkZeroGPTInput(inputOptions, runOptions = {}, detector) {
  const prepared = await prepareInput(inputOptions);
  const detect = runOptions.detector ?? detector;

  try {
    const result = await detect(prepared.text, runOptions);
    return {
      ...result,
      sourceFile: prepared.sourceFile,
      textSource: prepared.textSource,
      convertedFile: prepared.convertedFile,
      warnings: [...prepared.warnings, ...(result.warnings ?? [])]
    };
  } finally {
    await prepared.cleanup();
  }
}

export async function prepareInput(options = {}) {
  const sourceCount = [options.text, options.file, options.stdin].filter((value) =>
    value !== undefined && value !== null && String(value).length > 0
  ).length;

  if (sourceCount > 1) {
    throw new Error("Use only one input source: --text, --file, or stdin");
  }

  if (options.text) {
    return preparedText(String(options.text), {
      sourceFile: null,
      textSource: "direct-text"
    });
  }

  if (options.stdin) {
    return preparedText(String(options.stdin), {
      sourceFile: null,
      textSource: "stdin"
    });
  }

  if (!options.file) {
    throw new Error("No input text provided. Use --text, --file, or pipe stdin.");
  }

  return prepareFileInput(options.file, {
    keepTemp: options.keepTemp === true,
    tempDir: options.tempDir
  });
}

async function prepareFileInput(filePath, options) {
  const absolutePath = path.resolve(filePath);
  const ext = path.extname(absolutePath).toLowerCase();

  if (ext === ".docx") {
    return prepareDocx(absolutePath, options);
  }

  if (ext === ".pdf") {
    return preparePdf(absolutePath, options);
  }

  if (UNSUPPORTED_BINARY_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported binary file format: ${ext}. Convert it to .txt, .md, .docx, or embedded-text .pdf first.`);
  }

  const buffer = await fs.readFile(absolutePath);
  const text = decodeSafeUtf8(buffer, absolutePath, ext);
  return preparedText(text, {
    sourceFile: absolutePath,
    textSource: "original-file"
  });
}

async function prepareDocx(filePath, options) {
  const markdown = (await mammoth.convertToMarkdown({ path: filePath })).value.trim();
  if (!markdown) throw new Error("DOCX did not contain extractable text.");

  const temp = await writeConvertedText(markdown, options);
  return preparedText(markdown, {
    sourceFile: filePath,
    textSource: "generated-markdown",
    convertedFile: options.keepTemp ? temp.filePath : null,
    cleanup: options.keepTemp ? async () => {} : temp.cleanup
  });
}

async function preparePdf(filePath, options) {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({ pageJoiner: "\n\n" });
    const text = String(result.text ?? "").trim();
    if (!text) {
      throw new Error("PDF appears to be scanned or image-only; OCR is not supported yet.");
    }

    const temp = await writeConvertedText(text, options);
    return preparedText(text, {
      sourceFile: filePath,
      textSource: "generated-markdown",
      convertedFile: options.keepTemp ? temp.filePath : null,
      cleanup: options.keepTemp ? async () => {} : temp.cleanup
    });
  } finally {
    await parser.destroy();
  }
}

async function writeConvertedText(text, options) {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const baseDir = path.resolve(options.tempDir ?? path.join(os.tmpdir(), "zerogpt-codex-plugin"));
  const runDir = path.join(baseDir, runId);
  const filePath = path.join(runDir, "input.md");

  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(filePath, text, "utf8");

  return {
    filePath,
    cleanup: async () => {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  };
}

function preparedText(text, metadata) {
  const value = String(text ?? "").trim();
  if (!value) throw new Error("Input text is empty");

  return {
    text: value,
    sourceFile: metadata.sourceFile ?? null,
    textSource: metadata.textSource,
    convertedFile: metadata.convertedFile ?? null,
    warnings: metadata.warnings ?? [],
    cleanup: metadata.cleanup ?? async function noop() {}
  };
}

function decodeSafeUtf8(buffer, filePath, ext) {
  if (buffer.includes(0)) {
    throw new Error(`Unsupported binary file format: ${ext || path.basename(filePath)}. Convert it to text, DOCX, or embedded-text PDF first.`);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error(`File is not valid UTF-8 text: ${filePath}`);
  }
}
