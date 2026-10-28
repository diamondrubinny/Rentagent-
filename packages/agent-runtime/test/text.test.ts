import { describe, expect, it } from 'vitest';
import { detectFileType, extractText } from '../src/files';
import { chunkText, htmlToText, truncate } from '../src/text';

describe('htmlToText', () => {
  it('drops scripts and markup and decodes entities', () => {
    const html =
      '<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>שלום&nbsp;עולם</h1><p>A &amp; B &#x263A;</p></body></html>';
    expect(htmlToText(html)).toBe('שלום עולם\nA & B ☺');
  });
});

describe('chunkText', () => {
  it('chunks with overlap at sentence boundaries', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const chunks = chunkText(text, 200, 40);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((chunk) => chunk.length <= 200)).toBe(true);
    expect(chunks[0]!.endsWith('.')).toBe(true);
  });

  it('chunks scripts without spaces', () => {
    const chunks = chunkText('漢字'.repeat(1000), 300, 30);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.join('').length).toBeGreaterThanOrEqual(2000);
  });

  it('returns nothing for empty text', () => {
    expect(chunkText('   ')).toEqual([]);
  });
});

describe('truncate', () => {
  it('does not split surrogate pairs', () => {
    expect(truncate('😀😀😀', 3)).toBe('😀…');
  });
});

describe('detectFileType', () => {
  it('accepts valid text and PDF signatures', () => {
    expect(detectFileType(Buffer.from('שלום'), 'notes.md')).toBe('text/markdown');
    expect(detectFileType(Buffer.from('%PDF-1.7 ...'), 'doc.PDF')).toBe('application/pdf');
    expect(detectFileType(Buffer.from('{"a":1}'), 'data.json')).toBe('application/json');
  });

  it('rejects spoofed and binary content', () => {
    expect(detectFileType(Buffer.from('MZ\x90\x00binary'), 'notes.txt')).toBeNull();
    expect(detectFileType(Buffer.from('not a pdf'), 'doc.pdf')).toBeNull();
    expect(detectFileType(Buffer.from([0xff, 0xfe, 0xfd]), 'bad.txt')).toBeNull();
    expect(detectFileType(Buffer.from('{bad json'), 'data.json')).toBeNull();
    expect(detectFileType(Buffer.from('echo hi'), 'run.sh')).toBeNull();
    expect(detectFileType(Buffer.from('<svg onload=alert(1)>'), 'x.svg')).toBeNull();
  });
});

describe('extractText', () => {
  it('extracts text from a real PDF', async () => {
    // Minimal valid PDF with the text "Hello PDF".
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      null,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    const stream = 'BT /F1 12 Tf 20 100 Td (Hello PDF) Tj ET';
    objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const text = await extractText(Buffer.from(pdf, 'latin1'), 'application/pdf');
    expect(text).toContain('Hello PDF');
  });

  it('strips the BOM from text', async () => {
    expect(await extractText(Buffer.from('\uFEFFhi'), 'text/plain')).toBe('hi');
  });
});
