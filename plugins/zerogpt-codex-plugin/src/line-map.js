export function buildLineIndex(text) {
  const source = String(text ?? "");
  const lineStarts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") lineStarts.push(index + 1);
  }

  return { source, lineStarts };
}

export function mapHighlightedText(inputText, highlights, options = {}) {
  const index = buildLineIndex(inputText);
  const normalized = buildNormalizedMap(index.source);
  const usedRanges = [];
  const maxSnippetLength = options.maxSnippetLength ?? 180;

  return normalizeHighlightList(highlights)
    .map((highlight) => {
      const match = findBestMatch(normalized.text, normalizeText(highlight), usedRanges);
      if (!match) return null;

      const start = normalized.offsets[match.start] ?? 0;
      const end =
        normalized.offsets[Math.max(match.end - 1, match.start)] ??
        Math.max(0, index.source.length - 1);
      usedRanges.push(match);

      return {
        lineStart: offsetToLine(index.lineStarts, start),
        lineEnd: offsetToLine(index.lineStarts, end),
        snippet: createSnippet(index.source.slice(start, end + 1), maxSnippetLength)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.lineStart - b.lineStart || a.lineEnd - b.lineEnd);
}

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNormalizedMap(source) {
  let text = "";
  const offsets = [];
  let pendingSpaceOffset = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] === "\u00a0" ? " " : source[index];

    if (/\s/.test(char)) {
      if (text.length > 0 && pendingSpaceOffset === null) {
        pendingSpaceOffset = index;
      }
      continue;
    }

    if (pendingSpaceOffset !== null) {
      text += " ";
      offsets.push(pendingSpaceOffset);
      pendingSpaceOffset = null;
    }

    text += char;
    offsets.push(index);
  }

  return { text: text.trim(), offsets };
}

function normalizeHighlightList(highlights) {
  const normalized = [];

  for (const highlight of highlights ?? []) {
    const text = normalizeText(highlight);
    if (!text) continue;
    normalized.push(text);
  }

  return normalized;
}

function findBestMatch(source, highlight, usedRanges) {
  if (!highlight) return null;

  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(highlight, cursor);
    if (start === -1) break;

    const end = start + highlight.length;
    if (!usedRanges.some((range) => rangesOverlap(range, { start, end }))) {
      return { start, end };
    }
    cursor = start + 1;
  }

  return findFuzzySentenceMatch(source, highlight, usedRanges);
}

function findFuzzySentenceMatch(source, highlight, usedRanges) {
  const words = highlight.split(" ").filter(Boolean);
  if (words.length < 6) return null;

  const leading = words.slice(0, 5).join(" ");
  const trailing = words.slice(-5).join(" ");
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(leading, cursor);
    if (start === -1) break;

    const trailingStart = source.indexOf(trailing, start + leading.length);
    if (trailingStart !== -1) {
      const end = trailingStart + trailing.length;
      const candidate = { start, end };
      if (!usedRanges.some((range) => rangesOverlap(range, candidate))) return candidate;
    }

    cursor = start + 1;
  }

  return null;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function offsetToLine(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }

  return high + 1;
}

function createSnippet(value, maxLength) {
  const snippet = normalizeText(value);
  if (snippet.length <= maxLength) return snippet;
  return `${snippet.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}
