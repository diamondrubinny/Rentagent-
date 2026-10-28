import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAIL_TEMPLATES } from '@rentagent/core';
import { describe, expect, it } from 'vitest';
import { renderMail } from '../src/render';

const vars = {
  name: 'Dana',
  siteName: 'Agents',
  url: 'https://agents.example.com/verify?token=abc',
};

describe('renderMail', () => {
  it.each(MAIL_TEMPLATES.filter((template) => template !== 'agentMessage'))(
    'renders %s in every locale',
    (template) => {
      for (const locale of ['en', 'he', 'ar', 'ru']) {
        const mail = renderMail(template, locale, vars);
        expect(mail.subject).toContain('Agents');
        expect(mail.html).toContain('https://agents.example.com/verify?token=abc');
        expect(mail.text).toContain('https://agents.example.com/verify?token=abc');
        expect(mail.html).not.toMatch(/\{\w+\}/);
      }
    },
  );

  it('renders agent messages without a link, escaping and keeping line breaks', () => {
    const mail = renderMail('agentMessage', 'he', {
      siteName: 'Agents',
      subject: 'Quote',
      body: 'Line 1\n<b>Line 2</b>',
    });
    expect(mail.subject).toBe('Quote');
    expect(mail.html).toContain('Line 1<br>&lt;b&gt;Line 2&lt;/b&gt;');
    expect(mail.html).not.toContain('<a href');
    expect(mail.text).toContain('סוכן AI');
  });

  it('sets direction for RTL locales', () => {
    expect(renderMail('verifyEmail', 'he', vars).html).toContain('dir="rtl"');
    expect(renderMail('verifyEmail', 'en', vars).html).toContain('dir="ltr"');
  });

  it('escapes HTML in variables', () => {
    const mail = renderMail('verifyEmail', 'en', { ...vars, name: '<script>alert(1)</script>' });
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('removes line breaks from subjects', () => {
    const mail = renderMail('verifyEmail', 'en', { ...vars, siteName: 'A\r\nBcc: x@evil.test' });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('rejects non-http links', () => {
    expect(() =>
      renderMail('verifyEmail', 'en', { ...vars, url: 'javascript:alert(1)' }),
    ).toThrow();
  });

  it('falls back to English for unknown locales and uses the base language', () => {
    expect(renderMail('verifyEmail', 'xx', vars).html).toContain('lang="en"');
    expect(renderMail('verifyEmail', 'he-IL', vars).html).toContain('dir="rtl"');
  });
});

describe('catalogs', () => {
  const dir = join(import.meta.dirname, '../messages');
  const keys = (file: string) => {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    return Object.entries(data)
      .flatMap(([group, strings]) => Object.keys(strings).map((k) => `${group}.${k}`))
      .sort();
  };
  it.each(readdirSync(dir))('%s has the same keys as en.json', (file) => {
    expect(keys(file)).toEqual(keys('en.json'));
  });
});
