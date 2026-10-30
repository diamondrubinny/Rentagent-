import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUE_NAMES = {
  system: 'system',
  mail: 'mail',
  runs: 'agent-runs',
  files: 'files',
  webhooks: 'webhooks',
} as const;

export interface RunJob {
  runId: string;
}

/** Maintenance jobs handled by the worker's system queue. */
export type SystemJob =
  | { name: 'index-agent'; data: { agentId: string } }
  | { name: 'reindex-agents'; data: Record<string, never> }
  /** Machine-translates UI strings (key -> English source) into a locale. */
  | { name: 'translate-locale'; data: { locale: string; entries: Record<string, string> } }
  /** Fills missing agent name/description translations for the given locales. */
  | { name: 'translate-agent'; data: { agentId: string; locales: string[] } }
  /** Starts a scheduled task now (verified trigger call or "run now"); payload replaces {{payload}}. */
  | { name: 'schedule-trigger'; data: { scheduleId: string; payload: string } };

export type FileJob = { kind: 'scan'; fileId: string } | { kind: 'ingest'; sourceId: string };

export const MAIL_TEMPLATES = [
  'verifyEmail',
  'resetPassword',
  'accountExists',
  'passwordChanged',
  'twoFactorDisabled',
  /** Message composed by an AI agent (after approval); has no button. */
  'agentMessage',
  /** Scheduled tasks (V2.2): result ready, waiting for approval, paused after failures. */
  'scheduleResult',
  'scheduleApproval',
  'scheduleStopped',
] as const;
export type MailTemplate = (typeof MAIL_TEMPLATES)[number];

export interface MailJob {
  to: string;
  template: MailTemplate;
  locale: string;
  /** Template variables. URLs may contain one-time tokens: jobs are deleted on completion. */
  vars: Record<string, string>;
}

const globalForQueues = globalThis as unknown as {
  rentagentSystemQueue?: Queue;
  rentagentWebhookQueue?: Queue<{ deliveryId: string }>;
  rentagentMailQueue?: Queue<MailJob>;
  rentagentRunQueue?: Queue<RunJob>;
  rentagentFileQueue?: Queue<FileJob>;
};

export function getMailQueue(redisUrl: string): Queue<MailJob> {
  globalForQueues.rentagentMailQueue ??= new Queue<MailJob>(QUEUE_NAMES.mail, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: true,
      // Failed jobs are kept briefly for diagnosis; their tokens expire within 24 hours anyway.
      removeOnFail: { age: 24 * 60 * 60 },
    },
  });
  return globalForQueues.rentagentMailQueue;
}

export async function enqueueMail(redisUrl: string, job: MailJob): Promise<void> {
  await getMailQueue(redisUrl).add(job.template, job);
}

export async function enqueueRun(redisUrl: string, runId: string): Promise<void> {
  globalForQueues.rentagentRunQueue ??= new Queue<RunJob>(QUEUE_NAMES.runs, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 500,
    },
  });
  // A unique job id per enqueue lets a run be resumed after approval while older jobs are done.
  await globalForQueues.rentagentRunQueue.add(
    'run',
    { runId },
    { jobId: `${runId}-${Date.now()}` },
  );
}

export async function enqueueFileJob(redisUrl: string, job: FileJob): Promise<void> {
  globalForQueues.rentagentFileQueue ??= new Queue<FileJob>(QUEUE_NAMES.files, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 500,
    },
  });
  await globalForQueues.rentagentFileQueue.add(job.kind, job);
}

export async function enqueueSystemJob(redisUrl: string, job: SystemJob): Promise<void> {
  globalForQueues.rentagentSystemQueue ??= new Queue(QUEUE_NAMES.system, {
    connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });
  // Repeated requests for the same agent within a moment collapse into one job.
  const jobId =
    job.name === 'index-agent'
      ? `index-agent-${job.data.agentId}-${Math.floor(Date.now() / 5000)}`
      : undefined;
  // A trigger is never retried automatically: a retry could start a second run.
  const attempts = job.name === 'schedule-trigger' ? 1 : undefined;
  await globalForQueues.rentagentSystemQueue.add(job.name, job.data, { jobId, attempts });
}

/** Redis keys shared by the web app (proxy, message cache) and the worker. */
export const I18N_KEYS = {
  /** Incremented whenever locales or translations change; caches compare against it. */
  version: 'i18n:version',
  /** {"enabled": [...codes], "default": "code"} for locale negotiation in the proxy. */
  routing: 'i18n:routing',
  /** Progress of an automatic translation job: i18n:job:<locale>. */
  job: (locale: string) => `i18n:job:${locale}`,
} as const;

export interface TranslationJobProgress {
  status: 'running' | 'done' | 'failed';
  total: number;
  translated: number;
  rejected: number;
  updatedAt: string;
}

/** Outgoing webhook deliveries retry with backoff for about two hours. */
export async function enqueueWebhookDelivery(
  redisUrl: string,
  deliveryId: string,
  /** A new value for manual redeliveries: BullMQ ignores ids of jobs it still keeps. */
  round?: number,
): Promise<void> {
  globalForQueues.rentagentWebhookQueue ??= new Queue<{ deliveryId: string }>(
    QUEUE_NAMES.webhooks,
    {
      connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    },
  );
  await globalForQueues.rentagentWebhookQueue.add(
    'deliver',
    { deliveryId },
    { jobId: round ? `${deliveryId}-r${round}` : deliveryId },
  );
}
