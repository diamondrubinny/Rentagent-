/** Headers applied to every response (including static assets). */
export const STATIC_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

/** Legacy framing protection for every path except the embeddable widget page. */
export const FRAME_DENY_HEADER = { key: 'X-Frame-Options', value: 'DENY' };
/** Paths the widget is embedded from: /<locale>/embed/<key id>. */
export const EMBED_PATH = /^\/[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*\/embed\/([0-9a-f]{24})\/?$/;
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/;

/**
 * Builds a strict, nonce-based Content Security Policy for HTML responses.
 * Styles allow 'unsafe-inline' because React/Next inject style attributes;
 * scripts never do.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  isDev: boolean,
  /** Sites allowed to frame the page (widget only); anything not an origin is dropped. */
  frameAncestors: readonly string[] = [],
): string {
  const ancestors = frameAncestors.filter((origin) => ORIGIN.test(origin));
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...(isDev ? ['ws:'] : [])],
    'frame-ancestors': ancestors.length ? ancestors : ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (!isDev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
