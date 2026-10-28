import 'server-only';
import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'none';
  user: string;
  password: string;
}

export function createSmtpTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'none',
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

/** Verifies that the SMTP server accepts a connection (and credentials, if any). */
export async function verifySmtp(config: SmtpConfig): Promise<boolean> {
  try {
    await createSmtpTransport(config).verify();
    return true;
  } catch {
    return false;
  }
}
