/** Reading aids stored in the browser only (never sent to the server). */
export const A11Y_STORAGE_KEY = 'ra_a11y';
export const TEXT_SIZES = ['100', '115', '130', '150'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface A11yPreferences {
  size: TextSize;
  contrast: boolean;
  links: boolean;
  font: boolean;
  motion: boolean;
}

export const DEFAULT_A11Y: A11yPreferences = {
  size: '100',
  contrast: false,
  links: false,
  font: false,
  motion: false,
};

export function parseA11y(raw: string | null): A11yPreferences {
  try {
    const data = JSON.parse(raw ?? '{}') as Partial<A11yPreferences>;
    return {
      size: TEXT_SIZES.includes(data.size as TextSize) ? (data.size as TextSize) : '100',
      contrast: data.contrast === true,
      links: data.links === true,
      font: data.font === true,
      motion: data.motion === true,
    };
  } catch {
    return DEFAULT_A11Y;
  }
}

/** Mirrors preferences onto <html data-a11y-*> attributes that globals.css reacts to. */
export function applyA11y(preferences: A11yPreferences, root: HTMLElement): void {
  if (preferences.size === '100') root.removeAttribute('data-a11y-size');
  else root.setAttribute('data-a11y-size', preferences.size);
  for (const flag of ['contrast', 'links', 'font', 'motion'] as const) {
    if (preferences[flag]) root.setAttribute(`data-a11y-${flag}`, '');
    else root.removeAttribute(`data-a11y-${flag}`);
  }
}

/**
 * Inline script for <head>: applies saved preferences before the first paint so
 * text does not jump. Kept tiny and free of user data (values are whitelisted).
 */
export const A11Y_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${A11Y_STORAGE_KEY}')||'{}'),r=document.documentElement;if(['115','130','150'].indexOf(p.size)>-1)r.setAttribute('data-a11y-size',p.size);['contrast','links','font','motion'].forEach(function(k){if(p[k]===true)r.setAttribute('data-a11y-'+k,'')})}catch(e){}})();`;
