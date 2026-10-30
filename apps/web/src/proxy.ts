import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { getLocaleRouting, getWidgetOrigins, type LocaleRouting } from './lib/locale-routing';
import { buildContentSecurityPolicy, EMBED_PATH, generateNonce } from './lib/security-headers';

/** One next-intl handler per enabled-locales configuration (it rarely changes). */
const handlers = new Map<string, ReturnType<typeof createMiddleware>>();

function handlerFor(config: LocaleRouting) {
  const key = `${config.defaultLocale}|${config.enabled.join(',')}`;
  let handler = handlers.get(key);
  if (!handler) {
    // Negotiation (Accept-Language, cookie) only ever picks an enabled locale.
    handler = createMiddleware({
      ...routing,
      locales: config.enabled,
      defaultLocale: config.defaultLocale,
    });
    if (handlers.size > 20) handlers.clear();
    handlers.set(key, handler);
  }
  return handler;
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce();
  const embedKey = EMBED_PATH.exec(request.nextUrl.pathname)?.[1];
  const csp = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
    embedKey ? await getWidgetOrigins(embedKey) : [],
  );

  // Next.js reads the nonce from the request CSP header and applies it to its own scripts.
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);

  const response = handlerFor(await getLocaleRouting())(request);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
