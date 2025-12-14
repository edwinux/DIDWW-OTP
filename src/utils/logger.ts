/**
 * Simple console logger
 *
 * Basic logging utility for the gateway.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: object): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  debug: (message: string, meta?: object) => {
    if (shouldLog('debug')) console.log(formatMessage('debug', message, meta));
  },
  info: (message: string, meta?: object) => {
    if (shouldLog('info')) console.log(formatMessage('info', message, meta));
  },
  warn: (message: string, meta?: object) => {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, meta));
  },
  error: (message: string, meta?: object) => {
    if (shouldLog('error')) console.error(formatMessage('error', message, meta));
  },
};
