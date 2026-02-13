import { ErrorReporter } from './reporter/reporter.js';
import { logger } from './logger.js';

const reporter = new ErrorReporter({
  relayUrl: process.env.DEVSONAR_URL || 'http://localhost:9100',
  enabled: true,
  debug: process.env.DEVSONAR_DEBUG === 'true',
});

process.on('uncaughtException', (error: Error) => {
  reporter.report(error, 'uncaughtException');
  logger.error('DevSonar', 'Captured uncaughtException:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  reporter.report(error, 'unhandledRejection');
  logger.error('DevSonar', 'Captured unhandledRejection:', error);
});

logger.debug('DevSonar', `Error monitoring active (relay: ${process.env.DEVSONAR_URL || 'http://localhost:9100'})`);
