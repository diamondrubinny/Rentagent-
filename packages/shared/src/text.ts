/**
 * Normalizes user-provided text so that visually identical strings compare equal
 * across scripts (NFC), and strips control characters that have no place in
 * single-line fields. Bidi marks are preserved because they are meaningful in
 * mixed RTL/LTR text.
 */
export function normalizeText(value: string): string {
  return value.normalize('NFC');
}

// C0/C1 control characters except tab, newline and carriage return.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function normalizeSingleLine(value: string): string {
  return normalizeText(value)
    .replace(CONTROL_CHARS, '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Folds text for language-independent matching: compatibility decomposition,
 * no combining marks (Latin accents, Hebrew niqqud, Arabic harakat), no Arabic
 * tatweel, lower case and single spaces. Used on both stored text and queries.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/\u0640/g, '')
    .toLocaleLowerCase('und')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Distinct search terms of a query (at most 8, each at least 2 characters). */
export function searchTerms(query: string): string[] {
  return [...new Set(foldForSearch(query).split(' '))]
    .filter((term) => term.length >= 2)
    .slice(0, 8);
}
