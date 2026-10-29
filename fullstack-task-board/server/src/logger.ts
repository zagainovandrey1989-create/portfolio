import { pino, type Logger } from 'pino';

export type { Logger };

/**
 * Structured JSON logger. Level is controlled by LOG_LEVEL
 * (defaults to "info", or "silent" when running under tests).
 */
export function createLogger(level = process.env.LOG_LEVEL): Logger {
  const resolvedLevel = level ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');
  return pino({
    level: resolvedLevel,
    base: { service: 'task-board-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  });
}
