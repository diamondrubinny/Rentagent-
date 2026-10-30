import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { FRAME_DENY_HEADER, STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  // Dynamic file paths (branding images, legal templates) make tracing over-include
  // source files; the server never needs them at runtime.
  outputFileTracingExcludes: { '*': ['src/**', 'test/**'] },
  transpilePackages: [
    '@rentagent/shared',
    '@rentagent/core',
    '@rentagent/db',
    '@rentagent/mail',
    '@rentagent/ai-gateway',
    '@rentagent/agent-runtime',
    '@rentagent/billing',
    '@rentagent/license',
  ],
  serverExternalPackages: ['pino', 'pg', 'nodemailer', 'unpdf'],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: STATIC_SECURITY_HEADERS },
      // The widget page may be framed by the sites its key allows (CSP frame-ancestors).
      { source: '/:path((?!(?:[A-Za-z0-9-]+/)?embed/).*)', headers: [FRAME_DENY_HEADER] },
    ];
  },
};

export default withNextIntl(nextConfig);
