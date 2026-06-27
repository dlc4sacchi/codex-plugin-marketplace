import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import {
  defaultAnnotatedOutputPath,
  stripAiTags,
  writeAnnotatedFile
} from "./annotation.js";
import { combineChunkResults, splitTextForZeroGPT } from "./splitter.js";

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
    const chunks = splitTextForZeroGPT(prepared.text);
    let result =
      chunks.length === 1
        ? await detect(chunks[0].text, runOptions)
        : combineChunkResults(await detectChunks(chunks, detect, runOptions));
    const annotatedFile = runOptions.annotate
      ? await writeAnnotatedResult(prepared, result.flagged, runOptions)
      : null;

    if (annotatedFile) {
      result = {
        ...result,
        annotatedFile
      };
    }

    return {
      ...result,
      split: chunks.length > 1,
      chunkCount: chunks.length,
      chunks: chunks.length > 1 ? result.chunks : [],
      sourceFile: prepared.sourceFile,
      textSource: prepared.textSource,
      convertedFile: prepared.convertedFile,
      warnings: [...prepared.warnings, ...(result.warnings ?? [])]
    };
  } finally {
    await prepared.cleanup();
  }
}

async function detectChunks(chunks, detect, runOptions) {
  const concurrency = normalizeConcurrency(runOptions.concurrency);
  const results = new Array(chunks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < chunks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const chunk = chunks[currentIndex];
      results[currentIndex] = {
        chunk,
        result: await detectWithRetry(chunk.text, detect, runOptions)
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker()));
  return results;
}

async function detectWithRetry(text, detect, runOptions) {
  try {
    return await detect(text, runOptions);
  } catch (error) {
    if (runOptions.retryChunks === false) throw error;
    return detect(text, runOptions);
  }
}

function normalizeConcurrency(value) {
  if (value === undefined || value === null) return 1;
  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error("--concurrency must be an integer from 1 to 4");
  }
  return concurrency;
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
  const sanitized = omitEmbeddedDataUrls(String(text ?? ""));
  const stripped = stripAiTags(sanitized.text);
  const value = stripped.text.trim();
  if (!value) throw new Error("Input text is empty");

  return {
    text: value,
    sourceFile: metadata.sourceFile ?? null,
    textSource: metadata.textSource,
    convertedFile: metadata.convertedFile ?? null,
    warnings: [...new Set([...(metadata.warnings ?? []), ...sanitized.warnings, ...stripped.warnings])],
    cleanup: metadata.cleanup ?? async function noop() {}
  };
}

async function writeAnnotatedResult(prepared, flagged, runOptions) {
  const outputPath = resolveAnnotatedOutputPath(prepared, runOptions);
  return writeAnnotatedFile(prepared.text, flagged, outputPath);
}

function resolveAnnotatedOutputPath(prepared, runOptions) {
  if (runOptions.annotateOutput) return path.resolve(runOptions.annotateOutput);
  if (prepared.sourceFile) return defaultAnnotatedOutputPath(prepared.sourceFile);
  throw new Error("--annotate requires --file or --annotate-output for text/stdin input");
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

function omitEmbeddedDataUrls(text) {
  const warnings = [];
  const replaced = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/g, (match) => {
    warnings.push("Embedded image data URLs were omitted before checking.");
    const lineBreaks = match.match(/\n/g)?.length ?? 0;
    return `data:image;base64,[omitted]${"\n".repeat(lineBreaks)}`;
  });

  return {
    text: replaced,
    warnings: [...new Set(warnings)]
  };
}
