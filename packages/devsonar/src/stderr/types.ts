export interface ParsedError {
  language: string;
  errorType: string;
  message: string;
  stack: string;
  rawLines: string[];
}

export interface LanguageParser {
  readonly language: string;
  isErrorStart(line: string): boolean;
  isContinuation(line: string, linesSoFar: string[]): boolean;
  parse(lines: string[]): ParsedError;
}
