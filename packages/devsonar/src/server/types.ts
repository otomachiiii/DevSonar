export interface ErrorReport {
  message: string;
  stack?: string;
  source?: string;
  timestamp: string;
  context?: Record<string, any>;
}

export interface RelayConfig {
  port: number;
  claudeMode: 'sdk' | 'cli';
  debounceMs: number;
  maxBufferSize: number;
  maxStackLength: number;
  projectDir: string;
}

export interface HealthResponse {
  status: 'ok';
  buffered: number;
  session_id: string | null;
  target: 'claude-code';
}

export interface InFlightEntry {
  message: string;
  source?: string;
  sentAt: number;
  skippedCount: number;
  status: 'processing';
}
