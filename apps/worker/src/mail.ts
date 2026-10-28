import { decryptSecret, type Keyring, type MailJob, QUEUE_NAMES } from '@rentagent/core';
import { getSettings, type PrismaClient } from '@rentagent/db';
import { createSmtpTransport, renderMail } from '@rentagent/mail';
import { type ConnectionOptions, UnrecoverableError, Worker } from 'bullmq';
import type { Logger } from 'pino';

/**
 * Sends transactional email using the SMTP settings saved by the operator.
 * The SMTP password is decrypted only here, per job, and never logged.
 */
export function createMailWorker(deps: {
  connection: ConnectionOptions;
  db: PrismaClient;
  keyring: Keyring;
  log: Logger;
}): Worker<MailJob> {
  const { connection, db, keyring, log } = deps;

  return new Worker<MailJob>(
    QUEUE_NAMES.mail,
    async (job) => {
      const settings = await getSettings(db, ['mail.smtp', 'site.name'] as const);
      const smtp = settings['mail.smtp'];
      if (!smtp?.enabled) {
        // Nothing to retry until the operator configures SMTP.
        throw new UnrecoverableError('SMTP is not configured');
      }

      const message = renderMail(job.data.template, job.data.locale, {
        siteName: settings['site.name'] ?? 'RentAgent',
        ...job.data.vars,
      });
      const password = smtp.passwordEncrypted
        ? decryptSecret(smtp.passwordEncrypted, 'setting:mail.smtp.password', keyring)
        : '';

      const transport = createSmtpTransport({
        host: smtp.host,
        port: smtp.port,
        security: smtp.security,
        user: smtp.user,
        password,
      });
      try {
        await transport.sendMail({
          from: { name: smtp.fromName, address: smtp.fromEmail },
          to: job.data.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
      } finally {
        transport.close();
      }
      // Recipient addresses are personal data: log the template and job only.
      log.info({ jobId: job.id, template: job.data.template }, 'mail sent');
    },
    { connection, concurrency: 5 },
  );
}
