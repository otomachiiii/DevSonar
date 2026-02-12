import type { LanguageParser, ParsedError } from '../types.js';

export class PythonParser implements LanguageParser {
  readonly language = 'python';

  isErrorStart(line: string): boolean {
    return line === 'Traceback (most recent call last):';
  }

  isContinuation(line: string, linesSoFar: string[]): boolean {
    if (line.startsWith('  File "')) return true;
    if (line.startsWith('    ')) return true;
    if (line === '') return true;

    // Find the last non-empty line in linesSoFar
    const lastNonEmpty = this.lastNonEmptyLine(linesSoFar);
    if (lastNonEmpty === null) return true;

    // If the last non-empty line is still an indented/File line, continue
    if (lastNonEmpty.startsWith('  File "') || lastNonEmpty.startsWith('    ')) {
      return true;
    }

    // Otherwise, the final error line has already appeared
    return false;
  }

  parse(lines: string[]): ParsedError {
    const rawLines = lines.slice();
    // The final error line is the last non-empty line
    let errorLine = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== '') {
        errorLine = lines[i];
        break;
      }
    }

    let errorType = 'UnknownError';
    let message = '';
    const colonIndex = errorLine.indexOf(': ');
    if (colonIndex !== -1) {
      errorType = errorLine.substring(0, colonIndex);
      message = errorLine.substring(colonIndex + 2);
    } else {
      errorType = errorLine;
    }

    return {
      language: this.language,
      errorType,
      message,
      stack: rawLines.join('\n'),
      rawLines,
    };
  }

  private lastNonEmptyLine(lines: string[]): string | null {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== '') return lines[i];
    }
    return null;
  }
}
