import { FALLBACK_LOCALE, getTextDirection } from '@rentagent/shared';
import type { MailTemplate } from '@rentagent/core';
import ar from '../messages/ar.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import he from '../messages/he.json' with { type: 'json' };
import ru from '../messages/ru.json' with { type: 'json' };

type TemplateStrings = {
  subject: string;
  heading: string;
  body: string;
  button: string;
  note: string;
};
type Catalog = { layout: { footer: string } } & Record<MailTemplate, TemplateStrings>;

const CATALOGS: Record<string, Catalog> = { en, he, ar, ru };

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function interpolate(
  template: string,
  vars: Record<string, string>,
  escape: (v: string) => string,
) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? escape(vars[key] ?? '') : match,
  );
}

/** Only absolute http(s) URLs may be used as links in emails. */
function safeUrl(value: string | undefined): string {
  if (!value) throw new Error('Mail template requires a url');
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Unsafe mail url');
  return url.toString();
}

function catalogFor(locale: string): { catalog: Catalog; locale: string } {
  const language = locale.split('-')[0] ?? '';
  const catalog = CATALOGS[locale] ?? CATALOGS[language];
  return catalog ? { catalog, locale } : { catalog: en, locale: FALLBACK_LOCALE };
}

/**
 * Renders a transactional email. Variables are HTML-escaped in the HTML part,
 * subjects are stripped of line breaks (header injection), and links must be http(s).
 */
export function renderMail(
  template: MailTemplate,
  requestedLocale: string,
  vars: Record<string, string>,
): RenderedMail {
  const { catalog, locale } = catalogFor(requestedLocale);
  const strings = catalog[template];
  const url = safeUrl(vars.url);
  const dir = getTextDirection(locale);
  const align = dir === 'rtl' ? 'right' : 'left';
  const plain = (text: string) => interpolate(text, vars, (v) => v);
  const html = (text: string) => interpolate(text, vars, escapeHtml);

  const subject = plain(strings.subject)
    .replace(/[\r\n]+/g, ' ')
    .trim();
  const footer = catalog.layout.footer;

  const htmlBody = `<!doctype html>
<html lang="${escapeHtml(locale)}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#14161a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;">
<tr><td dir="${dir}" align="${align}" style="padding:32px;text-align:${align};line-height:1.6;">
<h1 style="margin:0 0 16px;font-size:22px;">${html(strings.heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;">${html(strings.body)}</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">${html(strings.button)}</a></p>
<p style="margin:0 0 24px;font-size:14px;color:#4a5160;">${html(strings.note)}</p>
<hr style="border:none;border-top:1px solid #c9ced8;margin:24px 0;">
<p style="margin:0;font-size:12px;color:#4a5160;">${html(footer)}<br><a href="${escapeHtml(url)}" dir="ltr" style="color:#1d4ed8;word-break:break-all;">${escapeHtml(url)}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    plain(strings.heading),
    '',
    plain(strings.body),
    '',
    `${plain(strings.button)}: ${url}`,
    '',
    plain(strings.note),
    '',
    '—',
    plain(footer),
    url,
  ].join('\n');

  return { subject, html: htmlBody, text };
}
