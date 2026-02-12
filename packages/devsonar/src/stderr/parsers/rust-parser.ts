import type { LanguageParser, ParsedError } from '../types.js';

export class RustParser implements LanguageParser {
  readonly language = 'rust';

  isErrorStart(line: string): boolean {
    return line.startsWith("thread '") && line.includes('panicked at');
  }

  isContinuation(line: string, _linesSoFar: string[]): boolean {
    if (/^\s+\d+:/.test(line)) return true;
    if (line.startsWith('note:')) return true;
    if (line.startsWith('stack backtrace:')) return true;
    if (/^\s+at /.test(line)) return true;
    return false;
  }

  parse(lines: string[]): ParsedError {
    const rawLines = lines.slice();
    const firstLine = lines[0] ?? '';

    let errorType = 'panic';
    let message = '';

    // Old format: thread 'main' panicked at 'message', file:line:col
    const oldMatch = firstLine.match(/^thread '(.+)' panicked at '(.+)'/);
    if (oldMatch) {
      errorType = `panic[thread '${oldMatch[1]}']`;
      message = oldMatch[2];
    } else {
      // New format: thread 'main' panicked at message
      const newMatch = firstLine.match(/^thread '(.+)' panicked at (.+)/);
      if (newMatch) {
        errorType = `panic[thread '${newMatch[1]}']`;
        message = newMatch[2];
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
