import pino, { type Logger } from 'pino';

/** Field paths that must never be written to logs. */
const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'smtpPassword',
  '*.smtpPassword',
  'licenseKey',
  '*.licenseKey',
];

let root: Logger | undefined;

export function getLogger(bindings?: Record<string, unknown>): Logger {
  root ??= pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { app: 'rentagent' },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return bindings ? root.child(bindings) : root;
}
