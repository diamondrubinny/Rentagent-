import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getServerEnv } from '@rentagent/core';
import { getSetting } from '@rentagent/db';
import { db } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/** Public logo/favicon uploaded by the operator (verified raster images only). */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== 'logo' && kind !== 'favicon') return new Response(null, { status: 404 });
  const image = (await getSetting(db(), 'branding'))?.[kind];
  if (!image || !/^[a-z]+-[0-9a-f]{16}\.(png|jpg|webp|ico)$/.test(image.file))
    return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(join(getServerEnv().FILES_DIR, 'branding', image.file));
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': image.mime,
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
