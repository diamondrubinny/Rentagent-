import 'server-only';
import { getSettings, type SettingValues } from '@rentagent/db';
import { checkPrimaryColor, isHexColor } from '@rentagent/shared';
import { cache } from 'react';
import { db } from './runtime';

export type Branding = SettingValues['branding'];
export type Features = SettingValues['features'];

export const DEFAULT_BRANDING: Branding = {
  primaryLight: null,
  primaryDark: null,
  logo: null,
  favicon: null,
  hidePoweredBy: false,
};
export const DEFAULT_FEATURES: Features = { feedback: true, semanticSearch: true };

export const getBranding = cache(async () => {
  const settings = await getSettings(db(), ['branding', 'features'] as const);
  return {
    branding: { ...DEFAULT_BRANDING, ...settings.branding },
    features: { ...DEFAULT_FEATURES, ...settings.features },
  };
});

/**
 * Theme overrides as CSS custom properties. Colors are re-validated here
 * (strict #rrggbb + WCAG AA), so nothing else can reach the stylesheet.
 */
export function brandingCss(branding: Branding): string {
  const rules: string[] = [];
  const block = (hex: string | null, theme: 'light' | 'dark') => {
    if (!isHexColor(hex)) return null;
    const check = checkPrimaryColor(hex, theme);
    return check.ok ? `--color-primary:${hex};--color-primary-fg:${check.foreground};` : null;
  };
  const light = block(branding.primaryLight, 'light');
  const dark = block(branding.primaryDark, 'dark');
  if (light) rules.push(`:root{${light}}`);
  if (dark) rules.push(`@media (prefers-color-scheme: dark){:root{${dark}}}`);
  return rules.join('');
}

/** Version token for cache busting of uploaded images. */
export const imageVersion = (image: { file: string } | null) =>
  image?.file.split('-').pop()?.split('.')[0] ?? '';
