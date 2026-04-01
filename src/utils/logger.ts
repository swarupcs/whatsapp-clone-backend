/**
 * logger.ts — Structured, leveled logger.
 *
 * In production, log lines are JSON (machine-parseable by Datadog, CloudWatch,
 * Loki, etc.).  In development they're human-friendly colored text.
 *
 * Levels: error > warn > info > http > debug
 *
 * Usage:
 *   logger.info('Server started', { port: 5000 });
 *   logger.warn('Rate limit hit', { ip: req.ip });
 *   logger.error(err, { requestId: '...' });
 */

import { env } from '../config/env.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'http' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  [key: string]: unknown;
}

// ─── ANSI colour helpers (dev only) ──────────────────────────────────────────

const COLOURS: Record<LogLevel, string> = {
  debug: '\x1b[37m', // white
  http: '\x1b[36m',  // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

// ─── Level priority (higher = more severe) ───────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  http: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const ACTIVE_LEVEL: LogLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? (env.isDev ? 'debug' : 'info');

// ─── Core log function ────────────────────────────────────────────────────────

function log(level: LogLevel, messageOrError: string | Error, meta: Record<string, unknown> = {}): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[ACTIVE_LEVEL]) return;

  const message =
    messageOrError instanceof Error ? messageOrError.message : messageOrError;

  const extra: Record<string, unknown> = {
    ...meta,
  };

  // Include stack trace for errors in development
  if (messageOrError instanceof Error) {
    extra['name'] = messageOrError.name;
    if (env.isDev && messageOrError.stack) {
      extra['stack'] = messageOrError.stack;
    }
  }

  if (env.isDev) {
    const colour = COLOURS[level];
    const prefix = `${colour}[${level.toUpperCase().padEnd(5)}]${RESET}`;
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
    const metaStr = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
    process.stdout.write(`${ts} ${prefix} ${message}${metaStr}\n`);
    return;
  }

  // Production: structured JSON
  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...extra,
  };

  // error goes to stderr, everything else stdout
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + '\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  http: (msg: string, meta?: Record<string, unknown>) => log('http', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (err: Error | string, meta?: Record<string, unknown>) => log('error', err, meta),
};
