export async function extractHighlightedTextFromPage(page) {
  return page.evaluate(collectHighlightedTextInBrowser);
}

export function collectHighlightedTextInBrowser() {
  function isYellowish(backgroundColor) {
    const match = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return false;

    const red = Number(match[1]);
    const green = Number(match[2]);
    const blue = Number(match[3]);
    return red >= 180 && green >= 160 && blue <= 120;
  }

  const verdictNode = [...document.body.querySelectorAll("*")].find((node) =>
    /^Your Text is/i.test(node.textContent?.trim() ?? "")
  );
  const candidates = [...document.body.querySelectorAll("mark, span, p, div")]
    .filter((node) => {
      if (
        verdictNode &&
        verdictNode.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING
      ) {
        return false;
      }

      const text = node.textContent?.trim() ?? "";
      if (text.length < 12) return false;
      if (/AI GPT|Export to PDF|Highlighted text|Characters|Words/i.test(text)) return false;

      const style = getComputedStyle(node);
      const bg = style.backgroundColor;
      const className = String(node.className ?? "");
      return (
        node.tagName.toLowerCase() === "mark" ||
        /(^|\s)(highlight|detected|ai-sentence|sentence)(\s|$)/i.test(className) ||
        isYellowish(bg)
      );
    })
    .map((node) => node.textContent.trim())
    .filter(Boolean);

  return [...new Set(candidates)];
}
