type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  process.env.DEVSONAR_DEBUG === 'true' ? 'debug'
  : (process.env.DEVSONAR_LOG_LEVEL as LogLevel) || 'warn';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export const logger = {
  debug(tag: string, msg: string): void {
    if (shouldLog('debug')) console.debug(`[${tag}] ${msg}`);
  },
  info(tag: string, msg: string): void {
    if (shouldLog('info')) console.log(`[${tag}] ${msg}`);
  },
  warn(tag: string, msg: string): void {
    if (shouldLog('warn')) console.warn(`[${tag}] ${msg}`);
  },
  error(tag: string, msg: string, err?: unknown): void {
    if (shouldLog('error')) console.error(`[${tag}] ${msg}`, err ?? '');
  },
} as const;
