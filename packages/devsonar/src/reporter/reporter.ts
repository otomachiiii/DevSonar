import { ErrorReport, ErrorReporterConfig } from './types.js';

export class ErrorReporter {
  private config: Required<ErrorReporterConfig>;

  constructor(config: ErrorReporterConfig = {}) {
    this.config = {
      relayUrl: config.relayUrl || 'http://localhost:9100',
      enabled: config.enabled !== undefined ? config.enabled : true,
      timeout: config.timeout || 1000,
      maxStackLength: config.maxStackLength || 2000,
      debug: config.debug || false,
    };
  }

  async report(error: Error | ErrorReport, source?: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const report = this.normalizeError(error, source);

    this.sendToRelay(report).catch((err) => {
      if (this.config.debug) {
        console.error('[ErrorReporter] Failed to send error to relay server:', err);
      }
    });
  }

  private normalizeError(error: Error | ErrorReport, source?: string): ErrorReport {
    if (this.isErrorReport(error)) {
      return error;
    }

    let stack = error.stack || '';
    if (stack.length > this.config.maxStackLength) {
      stack = stack.substring(0, this.config.maxStackLength) + '\n... (truncated)';
    }

    return {
      message: error.message,
      stack,
      source,
      timestamp: new Date().toISOString(),
    };
  }

  private async sendToRelay(report: ErrorReport): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.relayUrl}/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Relay server responded with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isErrorReport(obj: any): obj is ErrorReport {
    return obj && typeof obj === 'object' && 'message' in obj && 'timestamp' in obj;
  }
}

let globalReporter: ErrorReporter | null = null;

export function initErrorReporter(config?: ErrorReporterConfig): ErrorReporter {
  globalReporter = new ErrorReporter(config);

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event: ErrorEvent) => {
      if (event.error) {
        globalReporter!.report(event.error, 'window.onerror');
      }
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      globalReporter!.report(error, 'unhandledrejection');
    });

    const originalFetch = window.fetch.bind(window);
    const relayUrl = config?.relayUrl || 'http://localhost:9100';
    window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      try {
        const response = await originalFetch(...args);

        const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : '';
        if (!response.ok && !url.startsWith(relayUrl)) {
          const method = args[1]?.method || 'GET';
          const error = new Error(`HTTP ${response.status} ${response.statusText}: ${method} ${url}`);
          globalReporter!.report(error, `fetch ${method} ${url}`);
        }

        return response;
      } catch (err) {
        const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : '';
        if (!url.startsWith(relayUrl)) {
          const error = err instanceof Error ? err : new Error(String(err));
          globalReporter!.report(error, `fetch ${url}`);
        }
        throw err;
      }
    };
  }

  if (typeof process !== 'undefined' && process.on) {
    process.on('uncaughtException', (error: Error) => {
      globalReporter!.report(error, 'uncaughtException');
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      globalReporter!.report(error, 'unhandledRejection');
    });
  }

  return globalReporter;
}

export function getErrorReporter(): ErrorReporter {
  if (!globalReporter) {
    throw new Error('ErrorReporter not initialized. Call initErrorReporter() first.');
  }
  return globalReporter;
}

export function reportError(error: Error | ErrorReport, source?: string): void {
  if (globalReporter) {
    globalReporter.report(error, source);
  }
}
