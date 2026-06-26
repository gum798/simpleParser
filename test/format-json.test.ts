import { test, expect } from 'vitest';
import { formatJson, parseJsonTolerant, extractJsonBlocks } from '../src/format/json';
import { format } from '../src/format/index';

test('유효 JSON은 2칸 들여쓰기로 정렬', () => {
  const r = formatJson('{"a":1,"b":[2,3]}');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
});

test('콤마 빠진 JSON은 진단 + 줄:열 보고', () => {
  const r = formatJson('{\n  "a": 1\n  "b": 2\n}');
  expect(r.diagnostics.length).toBeGreaterThan(0);
  const d = r.diagnostics[0];
  expect(d.severity).toBe('error');
  expect(typeof d.line).toBe('number');
  expect(typeof d.col).toBe('number');
});

test('parseJsonTolerant는 복구된 값을 돌려준다', () => {
  const { value, diagnostics } = parseJsonTolerant('{"a":1,}');
  expect((value as { a: number }).a).toBe(1);
  expect(Array.isArray(diagnostics)).toBe(true);
});

test('디스패처가 json을 formatJson으로 라우팅', () => {
  expect(format('{"a":1}', 'json').output).toBe('{\n  "a": 1\n}');
});

test('로그에 박힌 JSON을 모두 추출해 정렬', () => {
  const log = 'INFO body={"a":1} ... resp body={"b":[2,3]}';
  const r = formatJson(log);
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toBe('{\n  "a": 1\n}\n\n{\n  "b": [\n    2,\n    3\n  ]\n}');
});

test('extractJsonBlocks는 유효 JSON 블록만 반환', () => {
  expect(extractJsonBlocks('x {"a":1} y {nope} z [1,2]')).toEqual(['{"a":1}', '[1,2]']);
});

test('문자열 안의 중괄호는 블록 경계로 오인하지 않음', () => {
  expect(extractJsonBlocks('log {"msg":"a } b","n":1} end')).toEqual(['{"msg":"a } b","n":1}']);
});

test('JSON 없는 텍스트는 진단', () => {
  const r = formatJson('just a log line with no json');
  expect(r.output).toBeUndefined();
  expect(r.diagnostics.length).toBeGreaterThan(0);
});
