import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import type { Diagnostic, FormatResult } from '../types';
import { offsetToLineCol } from '../util/offsetToLineCol';

export function parseJsonTolerant(text: string): { value: unknown; diagnostics: Diagnostic[] } {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  const diagnostics: Diagnostic[] = errors.map((e) => {
    const { line, col } = offsetToLineCol(text, e.offset);
    return {
      message: printParseErrorCode(e.error),
      offset: e.offset,
      length: e.length,
      line,
      col,
      severity: 'error',
    };
  });
  return { value, diagnostics };
}

export function formatJson(text: string): FormatResult {
  try {
    const value: unknown = JSON.parse(text);
    return { output: JSON.stringify(value, null, 2), diagnostics: [] };
  } catch {
    /* 관용 파싱으로 폴백 */
  }
  const { value, diagnostics } = parseJsonTolerant(text);
  const output = value === undefined ? undefined : JSON.stringify(value, null, 2);
  return { output, diagnostics };
}
