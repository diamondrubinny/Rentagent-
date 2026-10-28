import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isProviderType, PROVIDERS } from '@rentagent/ai-gateway';
import { getServerEnv } from '@rentagent/core';
import { getSetting, type SettingValues } from '@rentagent/db';
import { isBuiltinLocale } from '@rentagent/shared';
import { getBillingConfig } from './billing';
import { getBranding } from './branding';
import { db } from './runtime';
import { getSiteConfig } from './site';
import { type TemplateFacts, renderTemplate } from '../legal-template';

export const LEGAL_PAGES = ['privacy', 'terms', 'cookies', 'accessibility'] as const;
export type LegalPageKey = (typeof LEGAL_PAGES)[number];
export type LegalSettings = SettingValues['legal'];
/** Generous for a long policy, but bounded so the setting row stays small. */
export const LEGAL_OVERRIDE_MAX_CHARS = 60_000;

export const DEFAULT_LEGAL: LegalSettings = {
  company: '',
  address: '',
  country: '',
  contactEmail: '',
  privacyEmail: '',
  dpoName: '',
  accessibilityName: '',
  accessibilityEmail: '',
  accessibilityPhone: '',
  accessibilityResponseDays: 14,
  reviewed: {},
  overrides: {},
  updatedAt: '',
};

export async function getLegalSettings(): Promise<LegalSettings> {
  return { ...DEFAULT_LEGAL, ...(await getSetting(db(), 'legal')) };
}

const MISSING: Record<string, string> = {
  en: '[to be completed by the operator]',
  he: '[ימולא על ידי המפעיל]',
  ar: '[يُكمله المشغّل]',
  ru: '[заполняет оператор]',
};

/** What this installation actually does, for the document templates. */
async function installationFacts(locale: string): Promise<TemplateFacts> {
  const [site, legal, billing, branding, providers, webhooks, embedding] = await Promise.all([
    getSiteConfig(),
    getLegalSettings(),
    getBillingConfig(),
    getBranding(),
    db().provider.findMany({ where: { enabled: true }, select: { type: true, name: true } }),
    db().webhook.count({ where: { enabled: true } }),
    getSetting(db(), 'ai.embeddingModelId'),
  ]);
  const missing = MISSING[locale] ?? MISSING.en!;
  const or = (value: string) => value.trim() || missing;
  const providerNames = [
    ...new Set(
      // Generic OpenAI-compatible servers are named by the operator (e.g. a self-hosted model).
      providers.map((provider) =>
        isProviderType(provider.type) && provider.type !== 'OPENAI_COMPATIBLE'
          ? PROVIDERS[provider.type].label
          : provider.name,
      ),
    ),
  ];
  const updated = legal.updatedAt ? new Date(legal.updatedAt) : new Date();
  return {
    siteName: site.name,
    appUrl: getServerEnv().APP_URL.replace(/\/$/, ''),
    company: or(legal.company),
    address: or(legal.address),
    country: or(legal.country),
    contactEmail: or(legal.contactEmail),
    privacyEmail: or(legal.privacyEmail || legal.contactEmail),
    dpoName: legal.dpoName.trim(),
    hasDpo: Boolean(legal.dpoName.trim()),
    accessibilityName: or(legal.accessibilityName),
    accessibilityEmail: or(legal.accessibilityEmail || legal.contactEmail),
    accessibilityPhone: legal.accessibilityPhone.trim(),
    hasAccessibilityPhone: Boolean(legal.accessibilityPhone.trim()),
    accessibilityDays: String(legal.accessibilityResponseDays),
    updated: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(updated),
    providers: providerNames.length ? providerNames.join(', ') : missing,
    billing: billing.settings.enabled,
    stripe: billing.settings.enabled && Boolean(billing.stripe),
    paypal: billing.settings.enabled && Boolean(billing.paypal),
    retention: site.runRetentionDays > 0,
    retentionDays: String(site.runRetentionDays),
    webhooks: webhooks > 0,
    knowledge: Boolean(embedding),
    semanticSearch: Boolean(embedding) && branding.features.semanticSearch,
    feedback: branding.features.feedback,
    smtp: site.smtpEnabled,
    trackers: site.optionalTrackersEnabled,
  };
}

export interface LegalDocument {
  markdown: string;
  /** Plain-text values for the template tokens in `markdown` (see renderTemplate). */
  values: string[];
  /** Language of the text (drafts fall back to English for other locales). */
  lang: string;
  reviewed: boolean;
  custom: boolean;
}

/** The operator's own text if set for this locale, otherwise the filled-in draft. */
export async function legalDocument(page: LegalPageKey, locale: string): Promise<LegalDocument> {
  const legal = await getLegalSettings();
  const reviewed = legal.reviewed[page] === true;
  const custom = legal.overrides[page]?.[locale]?.trim();
  if (custom) return { markdown: custom, values: [], lang: locale, reviewed, custom: true };
  const lang = isBuiltinLocale(locale) ? locale : 'en';
  const template = await readFile(join(process.cwd(), 'legal', lang, `${page}.md`), 'utf8').catch(
    () => readFile(join(process.cwd(), 'apps/web/legal', lang, `${page}.md`), 'utf8'),
  );
  return {
    ...renderTemplate(template, await installationFacts(lang)),
    lang,
    reviewed,
    custom: false,
  };
}
