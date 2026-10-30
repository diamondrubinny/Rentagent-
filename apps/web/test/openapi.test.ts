import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openApiDocument } from '../src/lib/openapi';

const doc = openApiDocument('https://agents.example.com', '1.0.0');
const API_DIR = join(import.meta.dirname, '../src/app/api/v1');

describe('OpenAPI document', () => {
  it('resolves every $ref', () => {
    const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)];
    expect(refs.length).toBeGreaterThan(5);
    for (const [, name] of refs) expect(doc.components.schemas).toHaveProperty(name!);
  });

  it('describes only routes that exist, with the same methods', () => {
    for (const [path, item] of Object.entries(doc.paths)) {
      const file = join(API_DIR, path.replace(/\{(\w+)\}/g, '[$1]'), 'route.ts');
      expect(existsSync(file), file).toBe(true);
      const source = readFileSync(file, 'utf8');
      for (const method of Object.keys(item).filter((key) => key !== 'parameters'))
        expect(source, `${method.toUpperCase()} ${path}`).toMatch(
          new RegExp(`export async function ${method.toUpperCase()}\\b`),
        );
    }
  });

  it('points clients at this installation', () => {
    expect(doc.servers[0]!.url).toBe('https://agents.example.com/api/v1');
    expect(doc.openapi).toBe('3.1.0');
  });
});
