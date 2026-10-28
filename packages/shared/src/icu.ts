import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  type MessageFormatElement,
  parse,
} from '@formatjs/icu-messageformat-parser';

export interface IcuShape {
  /** Variable names, e.g. "count" in "{count, plural, ...}". */
  args: string[];
  /** Rich-text tag names, e.g. "link" in "<link>Sign in</link>". */
  tags: string[];
}

function collect(elements: MessageFormatElement[], args: Set<string>, tags: Set<string>) {
  for (const element of elements) {
    if (
      isArgumentElement(element) ||
      isNumberElement(element) ||
      isDateElement(element) ||
      isTimeElement(element)
    )
      args.add(element.value);
    if (isPluralElement(element) || isSelectElement(element)) {
      args.add(element.value);
      for (const option of Object.values(element.options)) collect(option.value, args, tags);
    }
    if (isTagElement(element)) {
      tags.add(element.value);
      collect(element.children, args, tags);
    }
  }
}

/** Variables and tags of an ICU message, or null when the message does not parse. */
export function icuShape(message: string): IcuShape | null {
  try {
    const args = new Set<string>();
    const tags = new Set<string>();
    collect(parse(message), args, tags);
    return { args: [...args].sort(), tags: [...tags].sort() };
  } catch {
    return null;
  }
}

/**
 * Whether a translation can safely replace the source: it parses and uses
 * exactly the same variables and tags (plural categories may differ by language).
 */
export function isCompatibleTranslation(source: string, translation: string): boolean {
  if (translation.trim() === '' && source.trim() !== '') return false;
  const a = icuShape(source);
  const b = icuShape(translation);
  return (
    a !== null &&
    b !== null &&
    a.args.join('\u0000') === b.args.join('\u0000') &&
    a.tags.join('\u0000') === b.tags.join('\u0000')
  );
}

/** Flattens nested messages into dotted keys: { A: { b: "x" } } -> { "A.b": "x" }. */
export function flattenMessages(
  messages: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else if (value && typeof value === 'object')
      Object.assign(out, flattenMessages(value as Record<string, unknown>, path));
  }
  return out;
}

/** Inverse of flattenMessages. */
export function unflattenMessages(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let node = out;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts.at(-1)!] = value;
  }
  return out;
}
