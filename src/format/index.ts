import type { Format, FormatResult } from '../types';
import { formatJson } from './json';

export function format(text: string, fmt: Format): FormatResult {
  switch (fmt) {
    case 'json':
      return formatJson(text);
    default:
      // 임시 패스스루 — Task 5~7에서 교체
      return { output: text, diagnostics: [] };
  }
}
