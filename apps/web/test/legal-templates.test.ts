import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import {
  rehypeTemplateValues,
  renderTemplate,
  TEMPLATE_FACTS,
  type TemplateFacts,
} from '../src/lib/legal-template';

const LEGAL_DIR = join(import.meta.dirname, '../legal');
const PAGES = ['privacy', 'terms', 'cookies', 'accessibility'];
const LANGS = readdirSync(LEGAL_DIR);

function facts(flag: boolean): TemplateFacts {
  return Object.fromEntries(
    TEMPLATE_FACTS.map((name) => [
      name,
      /^(has[A-Z]|billing$|stripe$|paypal$|retention$|webhooks$|knowledge$|semanticSearch$|feedback$|smtp$|trackers$)/.test(
        name,
      )
        ? flag
        : `<${name}>`,
    ]),
  ) as TemplateFacts;
}

function namesIn(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{[#^/]?(\w+)\}\}/g)].map((match) => match[1]!))];
}

describe('renderTemplate', () => {
  it('keeps or drops sections, including nested ones', () => {
    const base = facts(false);
    const template =
      '{{#stripe}}S{{/stripe}}{{#stripe}}{{#paypal}}+{{/paypal}}{{/stripe}}{{#paypal}}P{{/paypal}}{{^trackers}}none{{/trackers}}';
    const md = (extra: Partial<TemplateFacts>) =>
      renderTemplate(template, { ...base, ...extra }).markdown;
    expect(md({ stripe: true, paypal: true })).toBe('S+Pnone');
    expect(md({ stripe: true })).toBe('Snone');
    expect(md({ paypal: true, trackers: true })).toBe('P');
  });

  it('keeps values out of the Markdown source', () => {
    const out = renderTemplate('Hi {{company}}, {{dpoName}}{{unknown}}!', {
      ...facts(false),
      company: '[click](javascript:x)\n# h',
      dpoName: '',
    });
    expect(out.markdown).toBe('Hi \uE0000\uE001, !');
    expect(out.values).toEqual(['[click](javascript:x) # h']);
  });

  it('renders operator values as literal text through the real Markdown pipeline', () => {
    const value =
      'Acme <b>x</b> [l](https://evil.example) **s** https://bare.example www.w.example a@b.example `c` ~~d~~ | e';
    const { markdown, values } = renderTemplate(
      'By **{{company}}**.\n\n| a |\n|---|\n| {{company}} |',
      {
        ...facts(false),
        company: value,
      },
    );
    const html = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [rehypeTemplateValues(values)],
          skipHtml: true,
        },
        markdown,
      ),
    );
    const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    expect(html).toContain(`<p>By <strong>${escaped}</strong>.</p>`);
    expect(html).toContain(`<td>${escaped}</td>`);
    expect(html).not.toContain('<a');
  });
});

describe('legal templates', () => {
  it('exist for every language and page', () => {
    expect(LANGS.sort()).toEqual(['ar', 'en', 'he', 'ru']);
    for (const lang of LANGS)
      for (const page of PAGES)
        expect(readFileSync(join(LEGAL_DIR, lang, `${page}.md`), 'utf8').length).toBeGreaterThan(
          200,
        );
  });

  for (const page of PAGES) {
    const english = readFileSync(join(LEGAL_DIR, 'en', `${page}.md`), 'utf8');
    for (const lang of LANGS) {
      const template = readFileSync(join(LEGAL_DIR, lang, `${page}.md`), 'utf8');
      it(`${lang}/${page} uses only known values, the same as English, with balanced sections`, () => {
        for (const name of namesIn(template)) expect(TEMPLATE_FACTS).toContain(name);
        expect(namesIn(template).sort()).toEqual(namesIn(english).sort());
        for (const flag of [true, false]) {
          const out = renderTemplate(template, facts(flag)).markdown;
          expect(out).not.toMatch(/\{\{|\}\}/);
        }
        // The table rows survive conditional sections: every row has the header's column count.
        for (const out of [true, false].map(
          (flag) => renderTemplate(template, facts(flag)).markdown,
        )) {
          const rows = out.split('\n').filter((line) => line.startsWith('|'));
          const columns = new Set(rows.map((row) => row.split(/(?<!\\)\|/).length));
          expect(columns.size).toBeLessThanOrEqual(1);
        }
      });
    }
  }
});
