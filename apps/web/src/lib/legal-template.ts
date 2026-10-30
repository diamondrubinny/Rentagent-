// Pure helpers for the legal page templates (no server dependencies, unit-tested).

/** Every value the templates may use; installationFacts must provide all of them. */
export const TEMPLATE_FACTS = [
  'siteName',
  'appUrl',
  'company',
  'address',
  'country',
  'contactEmail',
  'privacyEmail',
  'dpoName',
  'hasDpo',
  'accessibilityName',
  'accessibilityEmail',
  'accessibilityPhone',
  'hasAccessibilityPhone',
  'accessibilityDays',
  'updated',
  'providers',
  'billing',
  'stripe',
  'paypal',
  'retention',
  'retentionDays',
  'webhooks',
  'knowledge',
  'semanticSearch',
  'feedback',
  'publicApi',
  'smtp',
  'trackers',
] as const;
export type TemplateFacts = Record<(typeof TEMPLATE_FACTS)[number], string | boolean>;

export interface RenderedTemplate {
  /** Markdown with a private-use token where each value goes. */
  markdown: string;
  values: string[];
}

const TOKEN = /(\d+)/g;

/**
 * Tiny template language for the legal drafts: {{name}} inserts a value;
 * {{#flag}}…{{/flag}} keeps a section when flag is truthy and {{^flag}}…{{/flag}}
 * when it is falsy. Unknown names render as empty text.
 *
 * Values are not placed in the Markdown itself (GFM would still turn a URL or
 * email inside one into a link, whatever the escaping): each becomes a token that
 * rehypeTemplateValues swaps for plain text after parsing.
 */
export function renderTemplate(template: string, facts: TemplateFacts): RenderedTemplate {
  const lookup = facts as Record<string, string | boolean | undefined>;
  let text = template;
  for (let pass = 0; pass < 3; pass++)
    text = text.replace(
      /\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g,
      (_match, kind: string, name: string, body: string) =>
        Boolean(lookup[name]) === (kind === '#') ? body : '',
    );
  const values: string[] = [];
  const markdown = text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = lookup[name];
    if (typeof value !== 'string' || !value) return '';
    values.push(value.replace(/\s+/g, ' '));
    return `${values.length - 1}`;
  });
  return { markdown, values };
}

interface HastNode {
  type: string;
  value?: string;
  children?: HastNode[];
}

/** Rehype plugin: replaces template tokens in text nodes with their plain-text values. */
export function rehypeTemplateValues(values: readonly string[]) {
  const fill = (node: HastNode) => {
    if (node.type === 'text' && node.value)
      node.value = node.value.replace(
        TOKEN,
        (_match, index: string) => values[Number(index)] ?? '',
      );
    node.children?.forEach(fill);
  };
  return () => (tree: HastNode) => fill(tree);
}
