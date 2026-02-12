import type { LanguageParser } from '../types.js';
import { PythonParser } from './python-parser.js';
import { GoParser } from './go-parser.js';
import { RubyParser } from './ruby-parser.js';
import { JavaParser } from './java-parser.js';
import { RustParser } from './rust-parser.js';

export function allParsers(): LanguageParser[] {
  return [
    new PythonParser(),
    new GoParser(),
    new RubyParser(),
    new JavaParser(),
    new RustParser(),
  ];
}

export { PythonParser, GoParser, RubyParser, JavaParser, RustParser };
