import { describe, expect, it } from 'vitest';
import { setupSchema } from '../src/setup-schema';

const base = {
  token: 'x'.repeat(40),
  siteName: '  My Agents\u0007 ',
  defaultLocale: 'he',
  baseCurrency: 'usd',
  timeZone: 'Asia/Jerusalem',
};

describe('setupSchema', () => {
  it('normalizes and accepts a minimal valid payload', () => {
    const result = setupSchema.parse(base);
    expect(result.siteName).toBe('My Agents');
    expect(result.baseCurrency).toBe('USD');
    expect(result.smtpEnabled).toBe(false);
  });

  it('rejects unknown currency and timezone with i18n keys', () => {
    const result = setupSchema.safeParse({ ...base, baseCurrency: 'ZZZ', timeZone: 'Nope/Nope' });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain('invalidCurrency');
    expect(messages).toContain('invalidTimeZone');
  });

  it('requires SMTP host and sender when SMTP is enabled', () => {
    const result = setupSchema.safeParse({ ...base, smtpEnabled: 'on' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['smtpHost', 'smtpFromEmail']));
  });

  it('accepts a complete SMTP configuration', () => {
    const result = setupSchema.parse({
      ...base,
      smtpEnabled: 'on',
      smtpHost: 'smtp.example.com',
      smtpPort: '465',
      smtpSecurity: 'tls',
      smtpFromEmail: 'noreply@example.com',
    });
    expect(result.smtpPort).toBe(465);
  });
});
