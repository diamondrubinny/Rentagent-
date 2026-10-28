const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Converts HTML to readable text (drops scripts, styles and markup; keeps paragraph breaks). */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#x'))
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16) || 32);
      if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)) || 32);
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .normalize('NFC');
}

/** Truncates text to `max` characters without splitting a surrogate pair. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${Array.from(text.slice(0, max + 1))
    .slice(0, -1)
    .join('')}…`;
}

/**
 * Splits text into overlapping chunks for embedding. Prefers paragraph, then
 * sentence, then whitespace boundaries, and falls back to characters so scripts
 * without spaces (Chinese, Japanese, Thai) are chunked correctly.
 */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const normalized = text.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);
    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const minBreak = Math.floor(size * 0.5);
      const candidates = [
        window.lastIndexOf('\n\n'),
        Math.max(
          ...['. ', '! ', '? ', '。', '！', '？', '؟ ', '।'].map((mark) =>
            window.lastIndexOf(mark),
          ),
        ),
        window.lastIndexOf(' '),
      ];
      const cut = candidates.find((index) => index >= minBreak);
      if (cut !== undefined) end = start + cut + 1;
    }
    const piece = normalized.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
