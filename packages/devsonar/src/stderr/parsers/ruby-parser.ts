import type { LanguageParser, ParsedError } from '../types.js';

export class RubyParser implements LanguageParser {
  readonly language = 'ruby';

  isErrorStart(line: string): boolean {
    if (/^.+:\d+:in `.+': .+ \(\S+\)/.test(line)) return true;
    if (/^.+:\d+:in `.+': .+/.test(line) && line.includes('(')) return true;
    return false;
  }

  isContinuation(line: string, _linesSoFar: string[]): boolean {
    return /^\s+from /.test(line);
  }

  parse(lines: string[]): ParsedError {
    const rawLines = lines.slice();
    const firstLine = lines[0] ?? '';

    let errorType = 'UnknownError';
    let message = '';

    const match = firstLine.match(/^(.+:\d+):in `.+': (.+) \((\S+)\)/);
    if (match) {
      errorType = match[3];
      message = match[2];
    } else {
      // Fallback: try to extract something useful
      const simpleMatch = firstLine.match(/^(.+:\d+):in `.+': (.+)/);
      if (simpleMatch) {
        message = simpleMatch[2];
      }
    }

    return {
      language: this.language,
      errorType,
      message,
      stack: rawLines.join('\n'),
      rawLines,
    };
  }
}
