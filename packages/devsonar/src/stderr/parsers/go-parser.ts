import type { LanguageParser, ParsedError } from '../types.js';

export class GoParser implements LanguageParser {
  readonly language = 'go';

  isErrorStart(line: string): boolean {
    return line.startsWith('panic:');
  }

  isContinuation(line: string, _linesSoFar: string[]): boolean {
    if (line.startsWith('goroutine ')) return true;
    if (line.startsWith('\t')) return true;
    if (line === '') return true;
    if (/^\S+\.\S+\(/.test(line)) return true;
    return false;
  }

  parse(lines: string[]): ParsedError {
    const rawLines = lines.slice();
    const firstLine = lines[0] ?? '';
    const message = firstLine.startsWith('panic: ')
      ? firstLine.substring('panic: '.length)
      : firstLine;

    return {
      language: this.language,
      errorType: 'panic',
      message,
      stack: rawLines.join('\n'),
      rawLines,
    };
  }
}
