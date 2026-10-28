import { checkEndpointUrl, embedTexts, type GatewayDeps } from '@rentagent/ai-gateway';
import { decryptSecret, enqueueMail } from '@rentagent/core';
import { getSetting } from '@rentagent/db';
import { type AgentConfig, isValidTimeZone } from '@rentagent/shared';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONSchema7 } from 'ai';
import { fetch as undiciFetch } from 'undici';
import { z } from 'zod';
import { CalculatorError, evaluateExpression } from './calculator';
import { BlockedDestinationError, safeFetch } from './net-guard';
import { htmlToText, truncate } from './text';

export interface RuntimeDeps extends GatewayDeps {
  redisUrl: string;
  appUrl: string;
}

export interface ToolRunContext {
  runId: string;
  agentId: string;
  userId: string | null;
  locale: string;
  config: AgentConfig;
}

export type ToolOutput = { ok: true; value: unknown } | { ok: false; error: string };

export interface RuntimeTool {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  requiresApproval: boolean;
  execute(input: unknown, context: ToolRunContext): Promise<ToolOutput>;
}

const MAX_TOOL_TEXT = 20_000;

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T | ToolOutput {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? parsed.data
    : {
        ok: false,
        error: `Invalid input: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
      };
}
const isOutput = (value: unknown): value is ToolOutput =>
  typeof value === 'object' &&
  value !== null &&
  'ok' in value &&
  ('error' in value || 'value' in value);

function calculatorTool(): RuntimeTool {
  return {
    name: 'calculator',
    description:
      'Evaluates an arithmetic expression exactly. Supports + - * / % ^, parentheses, sqrt, abs, round, floor, ceil, min, max, log, ln, pi.',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'e.g. "(120 * 1.17) / 3"' } },
      required: ['expression'],
      additionalProperties: false,
    },
    requiresApproval: false,
    async execute(input) {
      const data = parseInput(z.object({ expression: z.string().max(500) }), input);
      if (isOutput(data)) return data;
      try {
        return { ok: true, value: { result: evaluateExpression(data.expression) } };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof CalculatorError ? error.message : 'Invalid expression',
        };
      }
    },
  };
}

function currentTimeTool(defaultTimeZone: string): RuntimeTool {
  return {
    name: 'current_time',
    description: 'Returns the current date and time, optionally in a given IANA time zone.',
    inputSchema: {
      type: 'object',
      properties: { timeZone: { type: 'string', description: 'IANA zone, e.g. Asia/Jerusalem' } },
      additionalProperties: false,
    },
    requiresApproval: false,
    async execute(input) {
      const data = parseInput(z.object({ timeZone: z.string().max(64).optional() }), input ?? {});
      if (isOutput(data)) return data;
      const timeZone =
        data.timeZone && isValidTimeZone(data.timeZone) ? data.timeZone : defaultTimeZone;
      const now = new Date();
      return {
        ok: true,
        value: {
          iso: now.toISOString(),
          timeZone,
          local: new Intl.DateTimeFormat('en-CA', {
            timeZone,
            dateStyle: 'full',
            timeStyle: 'long',
          }).format(now),
        },
      };
    },
  };
}

function webFetchTool(): RuntimeTool {
  return {
    name: 'web_fetch',
    description:
      'Fetches a public web page or JSON document over HTTP(S) and returns its text. Private and internal addresses are blocked.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Absolute http(s) URL' } },
      required: ['url'],
      additionalProperties: false,
    },
    requiresApproval: false,
    async execute(input, context) {
      const data = parseInput(z.object({ url: z.string().max(2000) }), input);
      if (isOutput(data)) return data;
      try {
        const response = await safeFetch(data.url, {
          allowlist: context.config.fetchAllowedDomains,
        });
        const text = /html/i.test(response.contentType) ? htmlToText(response.body) : response.body;
        return {
          ok: true,
          value: {
            url: response.url,
            status: response.status,
            contentType: response.contentType.split(';')[0],
            truncated: response.truncated || text.length > MAX_TOOL_TEXT,
            text: truncate(text, MAX_TOOL_TEXT),
          },
        };
      } catch (error) {
        if (error instanceof BlockedDestinationError)
          return { ok: false, error: `Blocked destination (${error.reason})` };
        return { ok: false, error: 'The page could not be fetched' };
      }
    },
  };
}

/** Formats a float array as a pgvector literal. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

function knowledgeSearchTool(deps: RuntimeDeps): RuntimeTool {
  return {
    name: 'knowledge_search',
    description:
      "Searches the agent's knowledge base (documents uploaded by the operator) and returns the most relevant passages with their source file names. Works across languages.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    requiresApproval: false,
    async execute(input, context) {
      const data = parseInput(
        z.object({
          query: z.string().min(1).max(2000),
          limit: z.number().int().min(1).max(10).optional(),
        }),
        input,
      );
      if (isOutput(data)) return data;
      const modelId = await getSetting(deps.db, 'ai.embeddingModelId');
      if (!modelId) return { ok: false, error: 'No embedding model is configured' };
      const { embeddings } = await embedTexts(deps, modelId, [data.query], {
        purpose: 'knowledge_search',
        userId: context.userId ?? undefined,
      });
      const vector = toVectorLiteral(embeddings[0] ?? []);
      const rows = await deps.db.$queryRaw<{ content: string; file: string; score: number }[]>`
        SELECT c.content, f.original_name AS file, 1 - (c.embedding <=> ${vector}::vector) AS score
        FROM chunks c
        JOIN knowledge_sources ks ON ks.id = c.source_id
        JOIN files f ON f.id = ks.file_id
        WHERE c.agent_id = ${context.agentId}::uuid AND c.embedding_model_id = ${modelId}::uuid AND ks.status = 'READY'
        ORDER BY c.embedding <=> ${vector}::vector
        LIMIT ${data.limit ?? 5}`;
      return {
        ok: true,
        value: {
          results: rows.map((row) => ({
            file: row.file,
            score: Number(Number(row.score).toFixed(3)),
            text: row.content,
          })),
        },
      };
    },
  };
}

function sendEmailTool(deps: RuntimeDeps, approval: boolean): RuntimeTool {
  return {
    name: 'send_email',
    description:
      'Sends a plain-text email to one recipient. The message states that it was written by an AI agent.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', format: 'email' },
        subject: { type: 'string', maxLength: 150 },
        body: { type: 'string', maxLength: 5000 },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
    requiresApproval: approval,
    async execute(input, context) {
      const data = parseInput(
        z.object({
          to: z.email(),
          subject: z.string().min(1).max(150),
          body: z.string().min(1).max(5000),
        }),
        input,
      );
      if (isOutput(data)) return data;
      await enqueueMail(deps.redisUrl, {
        to: data.to,
        template: 'agentMessage',
        locale: context.locale,
        vars: { subject: data.subject.replace(/[\r\n]+/g, ' '), body: data.body },
      });
      return { ok: true, value: { queued: true, to: data.to } };
    },
  };
}

/** Fills {param} placeholders (URL-encoded) and returns the URL plus unused parameters. */
export function buildHttpToolUrl(
  template: string,
  params: Record<string, unknown>,
): { url: URL; rest: Record<string, unknown> } {
  const used = new Set<string>();
  const filled = template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) => {
    used.add(key);
    const value = params[key];
    return value === undefined || value === null ? '' : encodeURIComponent(String(value));
  });
  const url = new URL(filled);
  if (url.origin !== new URL(template.replace(/\{[^}]+\}/g, 'x')).origin)
    throw new Error('Host may not depend on parameters');
  const rest = Object.fromEntries(Object.entries(params).filter(([key]) => !used.has(key)));
  return { url, rest };
}

async function httpTools(deps: RuntimeDeps, config: AgentConfig): Promise<RuntimeTool[]> {
  const refs = config.tools.filter((tool) => tool.id.startsWith('http:'));
  if (refs.length === 0) return [];
  const rows = await deps.db.httpTool.findMany({
    where: { id: { in: refs.map((ref) => ref.id.slice(5)) }, enabled: true },
  });
  return rows.map((row) => {
    const ref = refs.find((candidate) => candidate.id === `http:${row.id}`)!;
    return {
      name: row.name,
      description: row.description,
      inputSchema: row.inputSchema as JSONSchema7,
      // Anything other than GET changes state elsewhere: approval unless explicitly disabled.
      requiresApproval: ref.approval === 'always',
      async execute(input) {
        const params = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
        const required = ((row.inputSchema as JSONSchema7).required ?? []) as string[];
        const missing = required.filter((key) => params[key] === undefined || params[key] === '');
        if (missing.length)
          return { ok: false, error: `Missing parameters: ${missing.join(', ')}` };
        let built;
        try {
          built = buildHttpToolUrl(row.urlTemplate, params);
        } catch {
          return { ok: false, error: 'Invalid parameters for this tool' };
        }
        const check = await checkEndpointUrl(built.url.toString());
        if (!check.ok) return { ok: false, error: 'Blocked destination' };
        if (row.method === 'GET') {
          for (const [key, value] of Object.entries(built.rest))
            built.url.searchParams.set(key, String(value));
        }
        const headers: Record<string, string> = row.headersEncrypted
          ? (JSON.parse(
              decryptSecret(row.headersEncrypted, `http-tool:${row.id}`, deps.keyring),
            ) as Record<string, string>)
          : {};
        try {
          const response = await undiciFetch(built.url, {
            method: row.method,
            headers: {
              accept: 'application/json, text/plain;q=0.9',
              ...(row.method === 'GET' ? {} : { 'content-type': 'application/json' }),
              ...headers,
            },
            body: row.method === 'GET' ? undefined : JSON.stringify(built.rest),
            redirect: 'error',
            signal: AbortSignal.timeout(20_000),
          });
          const raw = truncate(await response.text(), MAX_TOOL_TEXT);
          let body: unknown = raw;
          try {
            body = JSON.parse(raw);
          } catch {
            // keep text
          }
          return {
            ok: response.ok,
            ...(response.ok
              ? { value: { status: response.status, body } }
              : { error: `HTTP ${response.status}: ${truncate(raw, 500)}` }),
          } as ToolOutput;
        } catch {
          return { ok: false, error: 'The request failed' };
        }
      },
    };
  });
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: JSONSchema7;
}

async function withMcpClient<T>(
  server: { url: string; auth: string | null },
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: 'rentagent', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: server.auth ? { headers: { authorization: server.auth } } : undefined,
  });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Lists the tools offered by an MCP server (used by the admin "refresh tools" action). */
export async function discoverMcpTools(server: {
  url: string;
  auth: string | null;
}): Promise<McpToolInfo[]> {
  const check = await checkEndpointUrl(server.url);
  if (!check.ok) throw new BlockedDestinationError('private');
  return withMcpClient(server, async (client) => {
    const { tools } = await client.listTools();
    return tools.slice(0, 100).map((tool) => ({
      name: tool.name,
      description: tool.description?.slice(0, 1000),
      inputSchema: tool.inputSchema as JSONSchema7,
    }));
  });
}

export const mcpToolName = (slug: string, tool: string) =>
  `${slug}__${tool}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

async function mcpTools(deps: RuntimeDeps, config: AgentConfig): Promise<RuntimeTool[]> {
  const refs = config.tools.filter((tool) => tool.id.startsWith('mcp:'));
  if (refs.length === 0) return [];
  const servers = await deps.db.mcpServer.findMany({
    where: { id: { in: refs.map((ref) => ref.id.slice(4)) }, enabled: true },
  });
  return servers.flatMap((server) => {
    const ref = refs.find((candidate) => candidate.id === `mcp:${server.id}`)!;
    const auth = server.authEncrypted
      ? decryptSecret(server.authEncrypted, `mcp-server:${server.id}`, deps.keyring)
      : null;
    return (server.toolCache as unknown as McpToolInfo[]).map((tool) => ({
      name: mcpToolName(server.slug, tool.name),
      description: `[${server.name}] ${tool.description ?? tool.name}`,
      inputSchema: tool.inputSchema ?? { type: 'object' },
      requiresApproval: ref.approval === 'always',
      async execute(input: unknown): Promise<ToolOutput> {
        try {
          const result = await withMcpClient({ url: server.url, auth }, (client) =>
            client.callTool({
              name: tool.name,
              arguments: (input ?? {}) as Record<string, unknown>,
            }),
          );
          const content = (result.content as { type: string; text?: string }[] | undefined) ?? [];
          const text = truncate(
            content
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('\n'),
            MAX_TOOL_TEXT,
          );
          return result.isError
            ? { ok: false, error: truncate(text, 1000) || 'Tool error' }
            : { ok: true, value: { text } };
        } catch {
          return { ok: false, error: 'The MCP server could not be reached' };
        }
      },
    }));
  });
}

/** Resolves the tools enabled for an agent configuration. */
export async function buildTools(
  deps: RuntimeDeps,
  config: AgentConfig,
): Promise<Map<string, RuntimeTool>> {
  const timeZone = (await getSetting(deps.db, 'site.timeZone')) ?? 'UTC';
  const builtins: Record<string, (approval: boolean) => RuntimeTool> = {
    calculator: () => calculatorTool(),
    current_time: () => currentTimeTool(timeZone),
    web_fetch: () => webFetchTool(),
    knowledge_search: () => knowledgeSearchTool(deps),
    send_email: (approval) => sendEmailTool(deps, approval),
  };
  const tools: RuntimeTool[] = [];
  for (const ref of config.tools) {
    const factory = builtins[ref.id];
    if (factory) {
      const tool = factory(ref.approval === 'always');
      tools.push({ ...tool, requiresApproval: ref.approval === 'always' });
    }
  }
  tools.push(...(await httpTools(deps, config)), ...(await mcpTools(deps, config)));
  return new Map(tools.map((tool) => [tool.name, tool]));
}
