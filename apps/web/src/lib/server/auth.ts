import 'server-only';
import { hkdfSync } from 'node:crypto';
import {
  consumeRateLimit,
  enqueueMail,
  getServerEnv,
  type MailJob,
  sha256Hex,
} from '@rentagent/core';
import { getSettings } from '@rentagent/db';
import { FALLBACK_LOCALE, isBuiltinLocale } from '@rentagent/shared';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { audit } from './audit';
import { db, encryptionKeyring, logger, redis } from './runtime';

interface AuthRuntimeConfig {
  siteName: string;
  defaultLocale: string;
  registrationOpen: boolean;
}

/** Endpoints this product does not use; disabling them reduces the attack surface. */
const DISABLED_PATHS = [
  '/sign-in/social',
  '/callback/:id',
  '/link-social',
  '/unlink-account',
  '/list-accounts',
  '/account-info',
  '/get-access-token',
  '/refresh-token',
  '/change-email',
  '/delete-user',
  '/delete-user/callback',
  '/two-factor/send-otp',
  '/two-factor/verify-otp',
  '/update-session',
];

/** Derives the auth signing secret from the installation key (no extra secret to manage). */
function authSecret(): string {
  const key = encryptionKeyring().current;
  return Buffer.from(
    hkdfSync('sha256', key, Buffer.alloc(0), 'rentagent:better-auth:v1', 32),
  ).toString('base64');
}

/** Users carry an optional `locale` additional field that Better Auth's base type does not declare. */
function userLocale(user: object, fallback: string): string {
  const locale = 'locale' in user ? user.locale : undefined;
  return typeof locale === 'string' && isBuiltinLocale(locale) ? locale : fallback;
}

function sendMail(job: MailJob): void {
  // Never awaited by auth flows: response timing must not reveal whether an email was sent.
  enqueueMail(getServerEnv().REDIS_URL, job).catch((error: unknown) =>
    logger().error({ err: error, template: job.template }, 'failed to enqueue mail'),
  );
}

function createAuth(config: AuthRuntimeConfig) {
  const env = getServerEnv();
  const appUrl = env.APP_URL.replace(/\/$/, '');
  const link = (locale: string, path: string) => `${appUrl}/${locale}${path}`;

  return betterAuth({
    appName: config.siteName,
    baseURL: appUrl,
    basePath: '/api/auth',
    secret: authSecret(),
    trustedOrigins: [appUrl],
    database: prismaAdapter(db(), { provider: 'postgresql' }),
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,

    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'USER', input: false },
        status: { type: 'string', required: false, defaultValue: 'ACTIVE', input: false },
        locale: { type: 'string', required: false, input: true },
      },
    },

    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.registrationOpen,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        sendMail({
          to: user.email,
          template: 'resetPassword',
          locale: userLocale(user, config.defaultLocale),
          vars: { name: user.name, url },
        });
      },
      onPasswordReset: async ({ user }) => {
        await audit('auth.password_reset', { actorId: user.id });
        sendMail({
          to: user.email,
          template: 'passwordChanged',
          locale: userLocale(user, config.defaultLocale),
          vars: {
            name: user.name,
            url: link(userLocale(user, config.defaultLocale), '/account/security'),
          },
        });
      },
      // Sign-up with an existing email returns the same response; the owner is notified instead.
      onExistingUserSignUp: async ({ user }) => {
        const locale = userLocale(user, config.defaultLocale);
        sendMail({
          to: user.email,
          template: 'accountExists',
          locale,
          vars: { name: user.name, url: link(locale, '/sign-in') },
        });
      },
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        role: 'USER',
        status: 'ACTIVE',
        twoFactorEnabled: false,
        ...additionalFields,
        id,
      }),
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        sendMail({
          to: user.email,
          template: 'verifyEmail',
          locale: userLocale(user, config.defaultLocale),
          vars: { name: user.name, url },
        });
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 600, max: 5 },
        '/request-password-reset': { window: 600, max: 3 },
        '/reset-password': { window: 600, max: 5 },
        '/send-verification-email': { window: 600, max: 3 },
        '/change-password': { window: 600, max: 5 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/two-factor/enable': { window: 600, max: 5 },
        '/two-factor/disable': { window: 600, max: 5 },
      },
      customStorage: {
        consume: (key, rule) => consumeRateLimit(redis(), key, rule),
      },
    },

    advanced: {
      cookiePrefix: 'ra',
      useSecureCookies: appUrl.startsWith('https://'),
      // Caddy replaces X-Forwarded-For with the connecting client address.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },

    databaseHooks: {
      user: {
        create: {
          // Unknown locale codes from the sign-up form are dropped, never stored.
          before: async (user) => ({
            data: { ...user, locale: userLocale(user, config.defaultLocale) },
          }),
        },
      },
      session: {
        create: {
          // Disabled accounts cannot obtain new sessions.
          before: async (session) => {
            const user = await db().user.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            return user?.status === 'ACTIVE';
          },
        },
      },
    },

    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const failed = isAPIError(ctx.context.returned);
        const actorId = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id;
        const body = (ctx.body ?? {}) as { email?: unknown };
        const emailHash =
          typeof body.email === 'string'
            ? sha256Hex(body.email.trim().toLowerCase()).slice(0, 16)
            : undefined;

        switch (ctx.path) {
          case '/sign-in/email':
            await audit(failed ? 'auth.sign_in_failed' : 'auth.sign_in', {
              actorId,
              meta: failed ? { emailHash } : undefined,
            });
            break;
          case '/sign-up/email':
            if (!failed) await audit('auth.sign_up', { meta: { emailHash } });
            break;
          case '/sign-out':
            if (actorId) await audit('auth.sign_out', { actorId });
            break;
          case '/two-factor/verify-totp':
          case '/two-factor/verify-backup-code':
            await audit(failed ? 'auth.two_factor_failed' : 'auth.two_factor_verified', {
              actorId,
            });
            break;
          case '/revoke-session':
          case '/revoke-sessions':
          case '/revoke-other-sessions':
            if (!failed)
              await audit('auth.sessions_revoked', { actorId, meta: { path: ctx.path } });
            break;
          case '/change-password':
          case '/two-factor/disable': {
            if (failed || !ctx.context.session) break;
            const user = ctx.context.session.user;
            const locale = userLocale(user, config.defaultLocale);
            const isPassword = ctx.path === '/change-password';
            await audit(isPassword ? 'auth.password_changed' : 'auth.two_factor_disabled', {
              actorId: user.id,
            });
            sendMail({
              to: user.email,
              template: isPassword ? 'passwordChanged' : 'twoFactorDisabled',
              locale,
              vars: { name: user.name, url: link(locale, '/account/security') },
            });
            break;
          }
          case '/two-factor/enable':
            if (!failed) await audit('auth.two_factor_enable_started', { actorId });
            break;
        }
      }),
    },

    plugins: [
      twoFactor({
        issuer: config.siteName,
        backupCodeOptions: { amount: 10, length: 10 },
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 15 * 60 },
      }),
      nextCookies(), // must be last: lets server actions set auth cookies
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { rentagentAuth?: Promise<Auth> };

/**
 * Lazily builds the auth instance from installation settings.
 * Call `resetAuth()` after changing settings it depends on (site name, registration, SMTP).
 */
export function getAuth(): Promise<Auth> {
  globalForAuth.rentagentAuth ??= (async () => {
    const settings = await getSettings(db(), [
      'site.name',
      'site.defaultLocale',
      'auth.registrationMode',
      'mail.smtp',
    ] as const);
    const defaultLocale = settings['site.defaultLocale'] ?? FALLBACK_LOCALE;
    return createAuth({
      siteName: settings['site.name'] ?? 'RentAgent',
      defaultLocale: isBuiltinLocale(defaultLocale) ? defaultLocale : FALLBACK_LOCALE,
      // Open registration requires working email, because every account must verify its address.
      registrationOpen:
        settings['auth.registrationMode'] === 'open' && Boolean(settings['mail.smtp']?.enabled),
    });
  })().catch((error: unknown) => {
    globalForAuth.rentagentAuth = undefined;
    throw error;
  });
  return globalForAuth.rentagentAuth;
}

export function resetAuth(): void {
  globalForAuth.rentagentAuth = undefined;
}
