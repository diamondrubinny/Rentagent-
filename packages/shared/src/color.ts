/** WCAG 2.x contrast helpers for operator-chosen theme colors. */

const HEX = /^#[0-9a-f]{6}$/;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value);

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Theme surfaces the primary color is used on (see globals.css). */
export const THEME_SURFACES = {
  light: { background: '#ffffff', surface: '#f5f6f8', darkText: '#0b1220' },
  dark: { background: '#0f1115', surface: '#181b21', darkText: '#0b1220' },
} as const;

export interface PrimaryCheck {
  ok: boolean;
  /** Text color for buttons on the primary color. */
  foreground: string;
  onBackground: number;
  onSurface: number;
  buttonText: number;
}

/**
 * Checks a primary color for WCAG AA (4.5:1): as link text on the page
 * background and on cards, and with the better of white/dark text on buttons.
 */
export function checkPrimaryColor(hex: string, theme: 'light' | 'dark'): PrimaryCheck {
  const surfaces = THEME_SURFACES[theme];
  const white = contrastRatio(hex, '#ffffff');
  const dark = contrastRatio(hex, surfaces.darkText);
  const foreground = white >= dark ? '#ffffff' : surfaces.darkText;
  const result = {
    foreground,
    onBackground: contrastRatio(hex, surfaces.background),
    onSurface: contrastRatio(hex, surfaces.surface),
    buttonText: Math.max(white, dark),
  };
  return {
    ...result,
    ok: result.onBackground >= 4.5 && result.onSurface >= 4.5 && result.buttonText >= 4.5,
  };
}
