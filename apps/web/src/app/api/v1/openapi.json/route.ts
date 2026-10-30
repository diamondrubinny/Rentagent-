import { getServerEnv } from '@rentagent/core';
import { openApiDocument } from '@/lib/openapi';

export const dynamic = 'force-dynamic';

/** Public description of the API (no secrets; useful for client generators). */
export function GET() {
  const env = getServerEnv();
  return Response.json(openApiDocument(env.APP_URL.replace(/\/$/, ''), env.RENTAGENT_VERSION), {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
