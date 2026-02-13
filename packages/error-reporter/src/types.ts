export interface ErrorReport {
  message: string;
  stack?: string;
  source?: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface ErrorReporterConfig {
  relayUrl?: string;
  enabled?: boolean;
  timeout?: number;
  maxStackLength?: number;
  debug?: boolean;
}
