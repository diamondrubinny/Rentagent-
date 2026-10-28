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
