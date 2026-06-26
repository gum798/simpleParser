import type { Format, FormatResult } from '../types';
import { formatJson } from './json';
import { formatYaml } from './yaml';
import { formatXml } from './xml';
import { formatHtml } from './html';

export function format(text: string, fmt: Format): FormatResult {
  switch (fmt) {
    case 'json':
      return formatJson(text);
    case 'yaml':
      return formatYaml(text);
    case 'xml':
      return formatXml(text);
    case 'html':
      return formatHtml(text);
    case 'markdown':
      return { output: text, diagnostics: [] }; // v1: prettify 미지원
  }
}
