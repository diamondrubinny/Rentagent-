import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Tree = { [key: string]: string | Tree };
const dir = join(import.meta.dirname, '../messages');
const load = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as Tree;

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') entries.set(path, value);
    else for (const [k, v] of flatten(value, path)) entries.set(k, v);
  }
  return entries;
}

/** ICU argument names used in a message, e.g. "{siteName}". */
const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const reference = flatten(load('en.json'));
const locales = readdirSync(dir).filter((file) => file.endsWith('.json') && file !== 'en.json');

describe.each(locales)('%s', (file) => {
  const messages = flatten(load(file));

  it('has exactly the same keys as en.json', () => {
    expect([...messages.keys()].sort()).toEqual([...reference.keys()].sort());
  });

  it('uses the same placeholders as en.json', () => {
    for (const [key, value] of reference) {
      expect(placeholders(messages.get(key) ?? ''), key).toEqual(placeholders(value));
    }
  });
});
