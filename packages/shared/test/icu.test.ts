import { describe, expect, it } from 'vitest';
import { flattenMessages, icuShape, isCompatibleTranslation, unflattenMessages } from '../src/icu';
import { isSupportedLocale, SUPPORTED_LOCALES } from '../src/i18n';

describe('icuShape', () => {
  it('collects variables and tags, also inside plural branches', () => {
    expect(
      icuShape('{count, plural, one {# agent by {name}} other {# agents}} <link>open</link>'),
    ).toEqual({ args: ['count', 'name'], tags: ['link'] });
    expect(icuShape('Unclosed {name')).toBeNull();
  });
});

describe('isCompatibleTranslation', () => {
  const source = '<link>Sign in</link> to use {agent}.';
  it('accepts translations with the same variables and tags', () => {
    expect(isCompatibleTranslation(source, '<link>התחברו</link> כדי להשתמש ב־{agent}.')).toBe(true);
    expect(
      isCompatibleTranslation(
        '{count, plural, one {# item} other {# items}}',
        '{count, plural, one {פריט אחד} two {שני פריטים} other {# פריטים}}',
      ),
    ).toBe(true);
  });
  it('rejects renamed variables, lost tags, broken syntax and empty text', () => {
    expect(isCompatibleTranslation(source, '<link>Entrar</link> para usar {agente}.')).toBe(false);
    expect(isCompatibleTranslation(source, 'Entrar para usar {agent}.')).toBe(false);
    expect(isCompatibleTranslation(source, '<link>Entrar</link> {agent')).toBe(false);
    expect(isCompatibleTranslation(source, '  ')).toBe(false);
    expect(isCompatibleTranslation('Plain', 'Simple <b>bold</b>')).toBe(false);
  });
});

describe('flatten / unflatten', () => {
  it('round-trips nested messages', () => {
    const nested = { A: { b: 'x', c: { d: 'y' } }, E: 'z' };
    const flat = flattenMessages(nested);
    expect(flat).toEqual({ 'A.b': 'x', 'A.c.d': 'y', E: 'z' });
    expect(unflattenMessages(flat)).toEqual(nested);
  });
});

describe('supported locales', () => {
  it('includes built-ins and canonical codes only', () => {
    expect(isSupportedLocale('he')).toBe(true);
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('xx')).toBe(false);
    for (const code of SUPPORTED_LOCALES) expect(Intl.getCanonicalLocales(code)[0]).toBe(code);
    expect(new Set(SUPPORTED_LOCALES).size).toBe(SUPPORTED_LOCALES.length);
  });
});
