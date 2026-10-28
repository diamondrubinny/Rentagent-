import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getServerEnv } from '../src/env';

const valid = {
  APP_URL: 'https://agents.example.com',
  DATABASE_URL: 'postgresql://u:p@db:5432/rentagent',
  REDIS_URL: 'redis://:p@redis:6379',
  APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SETUP_TOKEN: 'x'.repeat(43),
};

describe('getServerEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = getServerEnv({ ...valid } as NodeJS.ProcessEnv);
    expect(env.FILES_DIR).toBe('/data/files');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('reports variable names without leaking values', () => {
    const secret = 'short-secret-value';
    expect(() => getServerEnv({ ...valid, SETUP_TOKEN: secret } as NodeJS.ProcessEnv)).toThrow(
      /SETUP_TOKEN/,
    );
    try {
      getServerEnv({ ...valid, SETUP_TOKEN: secret } as NodeJS.ProcessEnv);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
