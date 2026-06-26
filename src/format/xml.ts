import xmlFormat from 'xml-formatter';
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
    output = undefined; // 잘못된 XML — 진단만 제공, 부분 트리는 tree.ts가 담당
  }
  return { output, diagnostics };
}
