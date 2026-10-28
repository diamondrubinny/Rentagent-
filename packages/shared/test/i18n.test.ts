import { describe, expect, it } from 'vitest';
import { canonicalizeLocale, getTextDirection, isValidTimeZone } from '../src/i18n';

describe('getTextDirection', () => {
  it.each(['he', 'he-IL', 'iw', 'ar', 'ar-EG', 'fa', 'ur', 'yi', 'ps', 'ckb'])(
    '%s is rtl',
    (tag) => {
      expect(getTextDirection(tag)).toBe('rtl');
    },
  );

  it.each(['en', 'ru', 'zh-Hant', 'ja', 'th', 'pt-BR', 'tr'])('%s is ltr', (tag) => {
    expect(getTextDirection(tag)).toBe('ltr');
  });

  it('respects an explicit script subtag', () => {
    expect(getTextDirection('az-Arab')).toBe('rtl');
    expect(getTextDirection('ku-Latn')).toBe('ltr');
  });

  it('defaults to ltr for invalid tags', () => {
    expect(getTextDirection('not a locale!')).toBe('ltr');
  });
});

describe('canonicalizeLocale', () => {
  it('canonicalizes casing', () => {
    expect(canonicalizeLocale('pt-br')).toBe('pt-BR');
  });
  it('returns null for invalid tags', () => {
    expect(canonicalizeLocale('$$')).toBeNull();
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones', () => {
    expect(isValidTimeZone('Asia/Jerusalem')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });
  it('rejects unknown zones', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
