export interface ServerConfig {
  kid: string;
  privateKey: string;
  dataFile: string;
  port: number;
  /** Trust X-Forwarded-For from a reverse proxy for rate limiting. */
  trustProxy: boolean;
}

/** Reads configuration from the environment; secrets never come from files in the repo. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const privateKey = env.LICENSE_PRIVATE_KEY?.trim() ?? '';
  const kid = env.LICENSE_KEY_ID?.trim() ?? '';
  if (!privateKey || !kid)
    throw new Error(
      'LICENSE_PRIVATE_KEY and LICENSE_KEY_ID must be set (see license-admin keygen)',
    );
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(kid)) throw new Error('LICENSE_KEY_ID is invalid');
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');
  return {
    kid,
    privateKey,
    dataFile: env.LICENSE_DATA_FILE?.trim() || './data/licenses.json',
    port,
    trustProxy: env.TRUST_PROXY === 'true',
  };
}
