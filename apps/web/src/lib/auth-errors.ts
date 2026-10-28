/** Maps Better Auth error codes to i18n keys under "AuthErrors". Unknown codes map to "generic". */
const CODE_TO_KEY: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'invalidCredentials',
  INVALID_PASSWORD: 'invalidPassword',
  EMAIL_NOT_VERIFIED: 'emailNotVerified',
  PASSWORD_TOO_SHORT: 'passwordTooShort',
  PASSWORD_TOO_LONG: 'passwordTooLong',
  INVALID_TOKEN: 'invalidToken',
  TOKEN_EXPIRED: 'invalidToken',
  INVALID_CODE: 'invalidCode',
  INVALID_BACKUP_CODE: 'invalidCode',
  ACCOUNT_TEMPORARILY_LOCKED: 'locked',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'locked',
  INVALID_TWO_FACTOR_COOKIE: 'twoFactorExpired',
  FAILED_TO_CREATE_SESSION: 'signInUnavailable',
  SESSION_EXPIRED: 'sessionExpired',
  SESSION_NOT_FRESH: 'sessionExpired',
};

export function authErrorKey(error: { code?: string; status?: number } | null | undefined): string {
  if (!error) return 'generic';
  if (error.status === 429) return 'rateLimited';
  return (error.code && CODE_TO_KEY[error.code]) || 'generic';
}

/**
 * Accepts only same-origin relative paths for post-login redirects (prevents open redirects).
 * Rejects protocol-relative ("//evil"), backslash tricks and absolute URLs.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  try {
    const url = new URL(value, 'https://placeholder.invalid');
    if (url.origin !== 'https://placeholder.invalid') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
