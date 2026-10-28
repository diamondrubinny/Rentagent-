import { isBuiltinLocale } from '@rentagent/shared';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { buildContentSecurityPolicy, generateNonce } from './lib/security-headers';

const configuredDefault = process.env.DEFAULT_LOCALE ?? '';

const handleI18nRouting = createMiddleware({
  ...routing,
  defaultLocale: isBuiltinLocale(configuredDefault) ? configuredDefault : routing.defaultLocale,
});

export default function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');

  // Next.js reads the nonce from the request CSP header and applies it to its own scripts.
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);

  const response = handleI18nRouting(request);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
