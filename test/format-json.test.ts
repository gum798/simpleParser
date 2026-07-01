import { test, expect } from 'vitest';
import { formatJson, parseJsonTolerant, extractJsonBlocks } from '../src/format/json';
import { format } from '../src/format/index';

test('유효 JSON은 2칸 들여쓰기로 정렬', () => {
  const r = formatJson('{"a":1,"b":[2,3]}');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
});

test('충실도(faithful): 단일 JSON은 true — 유니코드/소수 정규화가 있어도', () => {
  // 자동 붙여넣기 정렬이 적용되어야 하는 케이스(값 보존, 구조 동일)
  expect(formatJson('{"a":1,"b":"x"}').faithful).toBe(true);
  expect(formatJson('{"emoji":"\\ud83d\\ude00","n":1.0}').faithful).toBe(true);
});

test('충실도(faithful): 로그 추출(blocks)·관용 복구(tolerant)는 false — 자동 정렬 보류', () => {
  expect(formatJson('INFO body={"a":1}').faithful).toBe(false); // blocks
  expect(formatJson('{"a":1 // 메모\n}').faithful).toBe(false); // tolerant(주석)
});

test('충실도(faithful): 중복 키는 false — 자동 정렬이 조용히 병합하지 않도록', () => {
  expect(formatJson('{"a":1,"a":2}').faithful).toBe(false);
  expect(formatJson('{"x":{"k":1,"k":2}}').faithful).toBe(false); // 중첩 객체도 감지
  expect(formatJson('{"a":1,"b":{"a":9}}').faithful).toBe(true); // 다른 스코프의 같은 이름은 중복 아님
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

test('대괄호 타임스탬프로 시작하는 로그도 추출', () => {
  const r = formatJson('[2026-06-26 10:00:00] INFO body={"x":1}');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toBe('{\n  "x": 1\n}');
});

test('중첩된 비-JSON 안의 JSON도 추출', () => {
  expect(extractJsonBlocks('Request{headers, body={"x":1}}')).toEqual(['{"x":1}']);
});

test('미닫힘 괄호가 많은 입력도 O(n)으로 빈 결과', () => {
  expect(extractJsonBlocks('{a '.repeat(5000))).toEqual([]);
});

test('깨진 단일 JSON 문서는 추출이 아니라 관용 복구', () => {
  const r = formatJson('{\n  "a": 1\n  "b": 2\n}'); // 콤마 누락 → 복구 + 진단
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(typeof r.diagnostics[0].line).toBe('number');
});

test('콤마 빠진(중첩 배열 포함) 단일 문서는 a를 버리지 않고 복구', () => {
  const r = formatJson('{"a":1 "b":[2,3]}');
  expect(r.diagnostics.length).toBeGreaterThan(0); // 미씽 콤마 진단 유지
  expect(r.output).toContain('"a"'); // 내부 [2,3]만 추출하고 a를 버리면 안 됨
  expect(r.output).toContain('"b"');
});
