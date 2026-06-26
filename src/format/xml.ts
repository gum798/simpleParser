import xmlFormat from 'xml-formatter';
import beautify from 'js-beautify';
import type { Diagnostic, FormatResult } from '../types';

export function xmlDiagnostics(text: string): Diagnostic[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (!err) return [];
  const message = (err.textContent ?? 'XML 파싱 오류').trim();
  const m = /line\s+(\d+)(?:[^\d]+column\s+(\d+))?/i.exec(message);
  return [
    {
      message: message.split('\n')[0],
      line: m ? Number(m[1]) : undefined,
      col: m && m[2] ? Number(m[2]) : undefined,
      severity: 'error',
    },
  ];
}

export function formatXml(text: string): FormatResult {
  const diagnostics = xmlDiagnostics(text);
  let output: string | undefined;
  try {
    output = xmlFormat(text, { collapseContent: true, indentation: '  ', lineSeparator: '\n' });
  } catch {
    // 잘못된 XML: html 모드로 best-effort 정렬(부분 결과) — 스펙 §6 폴백
    try {
      output = beautify.html(text, {
        indent_size: 2,
        wrap_line_length: 0,
        preserve_newlines: true,
        end_with_newline: false,
      });
    } catch {
      output = undefined;
    }
  }
  return { output, diagnostics };
}
