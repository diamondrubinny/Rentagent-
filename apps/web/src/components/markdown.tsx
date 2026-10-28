'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders model output as Markdown. Raw HTML is never rendered (skipHtml), links
 * open safely, and text direction follows the content.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div dir="auto" className="markdown space-y-3 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
