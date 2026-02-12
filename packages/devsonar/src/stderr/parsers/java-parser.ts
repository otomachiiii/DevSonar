import type { LanguageParser, ParsedError } from '../types.js';

export class JavaParser implements LanguageParser {
  readonly language = 'java';

  isErrorStart(line: string): boolean {
    if (line.startsWith('Exception in thread')) return true;
    if (/^[\w.$]+(?:Exception|Error)/.test(line)) return true;
    return false;
  }

  isContinuation(line: string, _linesSoFar: string[]): boolean {
    if (/^\s+at /.test(line)) return true;
    if (/^Caused by:/.test(line)) return true;
    if (/^\s+\.\.\./.test(line)) return true;
    if (/^\s/.test(line)) return true;
    return false;
  }

  parse(lines: string[]): ParsedError {
    const rawLines = lines.slice();
    const firstLine = lines[0] ?? '';

    let errorType = 'UnknownError';
    let message = '';

    if (firstLine.startsWith('Exception in thread')) {
      // Pattern: Exception in thread "main" com.example.FooException: some message
      const match = firstLine.match(
        /^Exception in thread ".*?" ([\w.$]+(?:Exception|Error)):\s*(.*)/,
      );
      if (match) {
        errorType = match[1];
        message = match[2];
      } else {
        // Pattern without message: Exception in thread "main" com.example.FooException
        const matchNoMsg = firstLine.match(
          /^Exception in thread ".*?" ([\w.$]+(?:Exception|Error))/,
        );
        if (matchNoMsg) {
          errorType = matchNoMsg[1];
        }
      }
    } else {
      // Pattern: com.example.FooException: some message
      const match = firstLine.match(/^([\w.$]+(?:Exception|Error)):\s*(.*)/);
      if (match) {
        errorType = match[1];
        message = match[2];
      } else {
        errorType = firstLine;
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
