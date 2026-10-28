import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUE_NAMES = {
  system: 'system',
  mail: 'mail',
} as const;

export const MAIL_TEMPLATES = [
  'verifyEmail',
  'resetPassword',
  'accountExists',
  'passwordChanged',
  'twoFactorDisabled',
] as const;
export type MailTemplate = (typeof MAIL_TEMPLATES)[number];

export interface MailJob {
  to: string;
  template: MailTemplate;
  locale: string;
  /** Template variables. URLs may contain one-time tokens: jobs are deleted on completion. */
  vars: Record<string, string>;
}

const globalForQueues = globalThis as unknown as { rentagentMailQueue?: Queue<MailJob> };

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
