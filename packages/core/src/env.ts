import { z } from 'zod';

const base64Key = z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
  error: 'must be 32 bytes encoded as base64 (openssl rand -base64 32)',
});

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  DATABASE_URL: z.string().startsWith('postgres'),
  REDIS_URL: z.string().startsWith('redis'),
  APP_ENCRYPTION_KEY: base64Key,
  /** Comma-separated previous keys, kept only to decrypt data during key rotation. */
  APP_ENCRYPTION_KEYS_PREVIOUS: z.string().optional().default(''),
  SETUP_TOKEN: z.string().min(32, { error: 'must be at least 32 characters' }),
  DEFAULT_LOCALE: z.string().default('en'),
  FILES_DIR: z.string().default('/data/files'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  RENTAGENT_VERSION: z.string().default('dev'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Validates environment variables lazily (never at import time) so that
 * build steps that import server modules do not require runtime secrets.
 */
export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached && source === process.env) return cached;
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Only report variable names and rules, never values.
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server environment: ${problems}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}
