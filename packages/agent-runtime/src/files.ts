import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import { htmlToText } from './text';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_TYPES = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
} as const;

/**
 * Determines the real file type from its content and name. PDFs must start with
 * the PDF signature; text formats must be valid UTF-8 without NUL bytes.
 * Returns null for anything not on the allowlist.
 */
export function detectFileType(buffer: Buffer, filename: string): string | null {
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  if (!(extension in ALLOWED_TYPES)) return null;
  const declared = ALLOWED_TYPES[extension as keyof typeof ALLOWED_TYPES];
  if (declared === 'application/pdf') {
    return buffer.subarray(0, 5).toString('latin1') === '%PDF-' ? declared : null;
  }
  if (buffer.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
  if (declared === 'application/json') {
    try {
      JSON.parse(buffer.toString('utf8'));
    } catch {
      return null;
    }
  }
  return declared;
}

/** Extracts plain text from an allowed file type. */
export async function extractText(buffer: Buffer, mime: string): Promise<string> {
  switch (mime) {
    case 'application/pdf': {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractPdfText(pdf, { mergePages: true });
      return (Array.isArray(text) ? text.join('\n\n') : text).normalize('NFC');
    }
    case 'text/html':
      return htmlToText(buffer.toString('utf8'));
    default:
      return buffer
        .toString('utf8')
        .replace(/^\uFEFF/, '')
        .normalize('NFC');
  }
}
