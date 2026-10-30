import 'server-only';
import { createHash } from 'node:crypto';
import { toVectorLiteral } from '@rentagent/agent-runtime';
import { embedTexts } from '@rentagent/ai-gateway';
import { rateLimit } from '@rentagent/core';
import { getSetting } from '@rentagent/db';
import {
  AGENT_CATEGORIES,
  type AgentConfig,
  agentConfigSchema,
  foldForSearch,
  localizedAgent,
  searchTerms,
} from '@rentagent/shared';
import { gatewayDeps } from './ai';
import { getBranding } from './branding';
import { clientIpHash, db, logger, redis } from './runtime';

export interface CatalogAgent {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  featured: boolean;
}

const PAGE_SIZE = 60;
const RELATED_LIMIT = 6;
/** Cosine distance above which a semantic match is not shown. */
const RELATED_MAX_DISTANCE = 0.75;
const QUERY_EMBEDDING_TTL = 24 * 60 * 60;
/** Uncached query embeddings per minute for the whole installation. */
const SEMANTIC_PER_MINUTE = 300;

const publishedWhere = { status: 'PUBLISHED' as const, publishedVersionId: { not: null } };
const select = {
  id: true,
  slug: true,
  name: true,
  description: true,
  localizations: true,
  category: true,
  featured: true,
} as const;

type Row = {
  id: string;
  slug: string;
  name: string;
  description: string;
  localizations: unknown;
  category: string;
  featured: boolean;
};

const toCatalogAgent = (row: Row, locale: string): CatalogAgent => ({
  id: row.id,
  slug: row.slug,
  category: row.category,
  featured: row.featured,
  ...localizedAgent(row, locale),
});

export const isCategory = (value: unknown): value is (typeof AGENT_CATEGORIES)[number] =>
  typeof value === 'string' && (AGENT_CATEGORIES as readonly string[]).includes(value);

/** Published agents matching every search term (in any language), featured first. */
export async function searchCatalog(
  locale: string,
  { query = '', category }: { query?: string; category?: string },
): Promise<CatalogAgent[]> {
  const terms = searchTerms(query);
  const rows = await db().agent.findMany({
    where: {
      ...publishedWhere,
      ...(isCategory(category) ? { category } : {}),
      AND: terms.map((term) => ({ searchText: { contains: term } })),
    },
    select,
    orderBy: [{ featured: 'desc' }, { name: 'asc' }],
    take: PAGE_SIZE,
  });
  return rows.map((row) => toCatalogAgent(row, locale));
}

export async function featuredAgents(locale: string, limit = 6): Promise<CatalogAgent[]> {
  const rows = await db().agent.findMany({
    where: publishedWhere,
    select,
    orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  });
  return rows.map((row) => toCatalogAgent(row, locale));
}

/** Query embedding, cached per model and folded query; rate limited per client. */
async function queryEmbedding(modelId: string, query: string): Promise<number[] | null> {
  const cacheKey = `search-emb:${modelId}:${createHash('sha256').update(foldForSearch(query)).digest('hex')}`;
  const cached = await redis().get(cacheKey);
  if (cached) return JSON.parse(cached) as number[];
  // Embedding calls cost money: per-client and installation-wide caps; text search still works.
  const perClient = await rateLimit(redis(), `semantic-search:${await clientIpHash()}`, 30, 60);
  if (!perClient.allowed) return null;
  const global = await rateLimit(redis(), 'semantic-search:all', SEMANTIC_PER_MINUTE, 60);
  if (!global.allowed) return null;
  const { embeddings } = await embedTexts(gatewayDeps(), modelId, [query], {
    purpose: 'search',
  });
  const vector = embeddings[0] ?? null;
  if (vector) await redis().set(cacheKey, JSON.stringify(vector), 'EX', QUERY_EMBEDDING_TTL);
  return vector;
}

/**
 * Semantically similar published agents (works across languages with a
 * multilingual embedding model). Empty when no embedding model is configured;
 * errors degrade to text-only search.
 */
export async function relatedAgents(
  locale: string,
  query: string,
  excludeIds: string[],
): Promise<CatalogAgent[]> {
  if (searchTerms(query).length === 0) return [];
  if (!(await getBranding()).features.semanticSearch) return [];
  try {
    const modelId = await getSetting(db(), 'ai.embeddingModelId');
    if (!modelId) return [];
    const vector = await queryEmbedding(modelId, query.slice(0, 500));
    if (!vector) return [];
    const literal = toVectorLiteral(vector);
    const matches = await db().$queryRaw<{ id: string }[]>`
      SELECT id FROM agents
      WHERE status = 'PUBLISHED' AND published_version_id IS NOT NULL
        AND embedding IS NOT NULL AND vector_dims(embedding) = ${vector.length}
        AND NOT (id = ANY(${excludeIds}::uuid[]))
        AND (embedding <=> ${literal}::vector) <= ${RELATED_MAX_DISTANCE}
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${RELATED_LIMIT}`;
    if (matches.length === 0) return [];
    const rows = await db().agent.findMany({
      where: { id: { in: matches.map((match) => match.id) } },
      select,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return matches
      .map((match) => byId.get(match.id))
      .flatMap((row) => (row ? [toCatalogAgent(row, locale)] : []));
  } catch (error) {
    logger().warn(
      { err: error instanceof Error ? error.message : String(error) },
      'semantic search failed',
    );
    return [];
  }
}

export interface RunnableAgent {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  versionId: string;
  config: AgentConfig;
}

/** A published agent with its current published configuration, or null. */
export async function runnableAgent(
  where: { slug: string } | { id: string },
  locale: string,
): Promise<RunnableAgent | null> {
  const agent = await db().agent.findFirst({
    where: { ...where, ...publishedWhere },
    select: { ...select, publishedVersionId: true },
  });
  if (!agent?.publishedVersionId) return null;
  const version = await db().agentVersion.findUnique({ where: { id: agent.publishedVersionId } });
  const parsed = agentConfigSchema.safeParse(version?.config);
  if (!version || !parsed.success) return null;
  return {
    ...toCatalogAgent(agent, locale),
    versionId: version.id,
    config: parsed.data,
  };
}

/** Published agents with their configuration in one batch (API listing); optionally limited. */
export async function runnableAgents(
  locale: string,
  ids?: readonly string[],
): Promise<RunnableAgent[]> {
  const agents = await db().agent.findMany({
    where: { ...publishedWhere, ...(ids?.length ? { id: { in: [...ids] } } : {}) },
    select: { ...select, publishedVersionId: true },
    orderBy: [{ featured: 'desc' }, { name: 'asc' }],
    take: 200,
  });
  const versions = await db().agentVersion.findMany({
    where: { id: { in: agents.map((agent) => agent.publishedVersionId!) } },
  });
  const byId = new Map(versions.map((version) => [version.id, version]));
  return agents.flatMap((agent) => {
    const version = byId.get(agent.publishedVersionId!);
    const parsed = agentConfigSchema.safeParse(version?.config);
    if (!version || !parsed.success) return [];
    return [{ ...toCatalogAgent(agent, locale), versionId: version.id, config: parsed.data }];
  });
}
