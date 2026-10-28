'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { rehypeTemplateValues } from '@/lib/legal-template';

/**
 * Renders model output as Markdown. Raw HTML is never rendered (skipHtml), links
 * open safely, and text direction follows the content.
 */
export function Markdown({
  children,
  values,
}: {
  children: string;
  /** Plain-text values for template tokens (legal drafts); never parsed as Markdown. */
  values?: readonly string[];
}) {
  return (
    <div dir="auto" className="markdown space-y-3 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={values?.length ? [rehypeTemplateValues(values)] : []}
        skipHtml
        components={{
          a: ({ href, children: label }) => (
            <a className="link" href={href} target="_blank" rel="noopener noreferrer nofollow">
              {label}
            </a>
          ),
          table: ({ children: rows }) => (
            <div className="overflow-x-auto" role="region" tabIndex={0}>
              <table className="w-full border-collapse text-sm">{rows}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
