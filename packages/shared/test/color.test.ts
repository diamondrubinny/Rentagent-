import { describe, expect, it } from 'vitest';
import { checkPrimaryColor, contrastRatio, isHexColor } from '../src/color';

describe('contrast', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
  it('validates hex colors strictly (no CSS injection)', () => {
    expect(isHexColor('#1d4ed8')).toBe(true);
    expect(isHexColor('#1D4ED8')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('#1d4ed8;}body{display:none')).toBe(false);
  });
  it('accepts the default theme colors and rejects weak ones', () => {
    expect(checkPrimaryColor('#1d4ed8', 'light')).toMatchObject({
      ok: true,
      foreground: '#ffffff',
    });
    expect(checkPrimaryColor('#8fb3ff', 'dark')).toMatchObject({ ok: true, foreground: '#0b1220' });
    expect(checkPrimaryColor('#ffcc00', 'light').ok).toBe(false);
    expect(checkPrimaryColor('#1d4ed8', 'dark').ok).toBe(false);
  });
});
