import fs from "node:fs/promises";
import path from "node:path";

export const AI_TAGS_REMOVED_WARNING = "Existing <ai> tags were removed before checking.";

export function stripAiTags(text) {
  const source = String(text ?? "");
  let removed = false;
  const stripped = source.replace(/<\s*\/?\s*ai\s*>/gi, () => {
    removed = true;
    return "";
  });

  return {
    text: stripped,
    warnings: removed ? [AI_TAGS_REMOVED_WARNING] : []
  };
}

export function annotateText(text, flagged) {
  const source = String(text ?? "");
  const ranges = mergeRanges(flaggedToRanges(flagged, source.length));
  let annotated = source;

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    annotated =
      annotated.slice(0, range.startOffset) +
      "<ai>" +
      annotated.slice(range.startOffset, range.endOffset) +
      "</ai>" +
      annotated.slice(range.endOffset);
  }

  return annotated;
}

export async function writeAnnotatedFile(text, flagged, outputPath) {
  const destination = path.resolve(outputPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, annotateText(text, flagged), "utf8");
  return destination;
}

export function defaultAnnotatedOutputPath(sourceFile) {
  const parsed = path.parse(path.resolve(sourceFile));
  return path.join(parsed.dir, `${parsed.name}.zerogpt.ai.md`);
}

function flaggedToRanges(flagged, maxLength) {
  return (flagged ?? [])
    .filter((item) => Number.isFinite(item.startOffset) && Number.isFinite(item.endOffset))
    .map((item) => ({
      startOffset: Math.max(0, Math.min(maxLength, item.startOffset)),
      endOffset: Math.max(0, Math.min(maxLength, item.endOffset))
    }))
    .filter((range) => range.startOffset < range.endOffset)
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
}

function mergeRanges(ranges) {
  const merged = [];

  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.startOffset <= previous.endOffset) {
      previous.endOffset = Math.max(previous.endOffset, range.endOffset);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}
