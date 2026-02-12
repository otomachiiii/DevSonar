import * as http from 'node:http';
import type { LanguageParser, ParsedError } from './types.js';
import { allParsers } from './parsers/index.js';

const IDLE_THRESHOLD = 2;
const MAX_TRACE_LINES = 200;

type State = 'IDLE' | 'ACCUMULATING';

export class StderrParser {
  private state: State = 'IDLE';
  private lineBuffer = '';
  private accumulatedLines: string[] = [];
  private activeParser: LanguageParser | null = null;
  private idleCount = 0;
  private parsers: LanguageParser[];
  private relayUrl: string;
  private source: string;

  constructor(relayUrl: string, source = 'stderr') {
    this.parsers = allParsers();
    this.relayUrl = relayUrl;
    this.source = source;
  }

  feed(chunk: Buffer): void {
    // Skip chunks containing null bytes (binary data)
    if (chunk.includes(0x00)) return;

    // Skip chunks with high ratio of replacement characters (U+FFFD)
    const text = chunk.toString('utf-8');
    const replacementCount = (text.match(/\uFFFD/g) || []).length;
    if (replacementCount > text.length * 0.1) return;

    // Partial-line buffering
    const combined = this.lineBuffer + text;
    const lines = combined.split('\n');
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      this.processLine(line);
    }
  }

  private processLine(line: string): void {
    if (this.state === 'IDLE') {
      for (const parser of this.parsers) {
        if (parser.isErrorStart(line)) {
          this.state = 'ACCUMULATING';
          this.activeParser = parser;
          this.accumulatedLines = [line];
          this.idleCount = 0;
          return;
        }
      }
    } else {
      if (this.accumulatedLines.length >= MAX_TRACE_LINES) {
        this.emitError();
        return;
      }

      if (this.activeParser!.isContinuation(line, this.accumulatedLines)) {
        this.accumulatedLines.push(line);
        this.idleCount = 0;
      } else {
        this.idleCount++;
        this.accumulatedLines.push(line);
        if (this.idleCount >= IDLE_THRESHOLD) {
          this.emitError();
        }
      }
    }
  }

  flush(): void {
    if (this.lineBuffer) {
      this.processLine(this.lineBuffer);
      this.lineBuffer = '';
    }
    if (this.state === 'ACCUMULATING' && this.accumulatedLines.length > 0) {
      this.emitError();
    }
  }

  private emitError(): void {
    if (!this.activeParser || this.accumulatedLines.length === 0) {
      this.reset();
      return;
    }

    const parsed = this.activeParser.parse(this.accumulatedLines);
    this.sendToRelay(parsed);
    this.reset();
  }

  private reset(): void {
    this.state = 'IDLE';
    this.activeParser = null;
    this.accumulatedLines = [];
    this.idleCount = 0;
  }

  private sendToRelay(parsed: ParsedError): void {
    const payload = JSON.stringify({
      message: `${parsed.errorType}: ${parsed.message}`,
      stack: parsed.stack,
      source: `${this.source}-${parsed.language}`,
      timestamp: new Date().toISOString(),
      context: { language: parsed.language, detectedVia: 'stderr' },
    });

    const url = new URL('/errors', this.relayUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options);
    req.on('error', () => {}); // Fail silently
    req.write(payload);
    req.end();
  }
}
