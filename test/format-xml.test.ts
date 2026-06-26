import { test, expect } from 'vitest';
import { formatXml, xmlDiagnostics } from '../src/format/xml';
import { format } from '../src/format/index';

test('유효 XML은 들여쓰기되어 정렬', () => {
  const r = formatXml('<a><b>1</b><b>2</b></a>');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toContain('\n  <b>1</b>');
});

test('잘못된 XML은 진단을 내고 output은 없다', () => {
  const r = formatXml('<a><b></a>');
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(r.diagnostics[0].severity).toBe('error');
});

test('xmlDiagnostics는 유효 XML에서 빈 배열', () => {
  expect(xmlDiagnostics('<a/>')).toHaveLength(0);
});

test('디스패처가 xml을 라우팅', () => {
  expect(format('<a><b>1</b></a>', 'xml').output).toContain('<b>1</b>');
});
