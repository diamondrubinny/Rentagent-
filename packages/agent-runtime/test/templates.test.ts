import { agentConfigSchema, agentMetaSchema } from '@rentagent/shared';
import { describe, expect, it } from 'vitest';
import { AGENT_TEMPLATES } from '../templates';

describe('agent templates', () => {
  it.each(AGENT_TEMPLATES.map((template) => [template.key, template] as const))(
    '%s is valid',
    (_key, template) => {
      expect(agentConfigSchema.safeParse(template.config).error?.issues ?? []).toEqual([]);
      expect(
        agentMetaSchema.safeParse({
          slug: template.slug,
          name: template.name.en,
          category: template.category,
          description: template.description.en,
        }).success,
      ).toBe(true);
      for (const locale of ['en', 'he', 'ar', 'ru'] as const) {
        expect(template.name[locale].length).toBeGreaterThan(0);
        expect(template.description[locale].length).toBeGreaterThan(0);
      }
    },
  );

  it('requires approval for every side-effect tool', () => {
    for (const template of AGENT_TEMPLATES) {
      for (const tool of template.config.tools) {
        if (tool.id === 'send_email') expect(tool.approval).toBe('always');
      }
    }
  });

  it('has unique keys and slugs', () => {
    expect(new Set(AGENT_TEMPLATES.map((t) => t.slug)).size).toBe(AGENT_TEMPLATES.length);
  });
});
