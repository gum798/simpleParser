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

test('문자열 안 raw 줄바꿈(터미널 랩 복사) 복구: 전체가 JSON', () => {
  const r = formatJson('{"a":"과제내용\n1","id":"ab\n-cd"}');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  expect(r.output).toContain('"과제내용1"');
  expect(r.output).toContain('"ab-cd"');
  expect(r.faithful).toBe(false); // 내용을 고친 복구 → 자동 정렬 보류
});

test('문자열 안 raw 줄바꿈 복구: 로그 접두어 뒤 JSON도 통째로 추출', () => {
  const log = 'request_body path=/x body=\n{"runId":"r1","msg":"지표를\n실시간으로 수집"}';
  const r = formatJson(log);
  expect(r.output).toContain('"runId": "r1"');
  expect(r.output).toContain('"지표를실시간으로 수집"');
  expect(r.faithful).toBe(false);
});

test('이스케이프 중간에 낀 랩(역슬래시 뒤 줄바꿈)도 복구', () => {
  const r = formatJson('{"s":"a\\' + '\n' + 'n b"}'); // 원본 "a\n b"가 \와 n 사이에서 랩된 경우
  expect(r.output).toContain('"a\\n b"');
});

test('extractJsonBlocks: 문자열 안 줄바꿈이 낀 블록도 복구해 통째로 반환', () => {
  expect(extractJsonBlocks('x {"a":"b\nc"} y')).toEqual(['{"a":"bc"}']);
});

test('문자열 밖 줄바꿈(정상 pretty-print)은 복구 대상 아님 — 기존 동작 유지', () => {
  const r = formatJson('{\n  "a": 1\n}');
  expect(r.faithful).toBe(true);
  expect(r.output).toBe('{\n  "a": 1\n}');
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

// ── 제자리 정렬(원본 유지): 주변 텍스트는 그대로, JSON 블록만 펼침 ──

test('formatJsonInPlace: 로그 접두어·후미를 남기고 JSON만 제자리에서 펼친다', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const r = formatJsonInPlace('log body={"x":1} end');
  expect(r.output).toBe('log body={\n  "x": 1\n} end');
  expect(r.faithful).toBe(false); // 내용(공백) 변경 → 자동 정렬 보류
});

test('formatJsonInPlace: 여러 블록도 각자 제자리에서 펼친다', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const r = formatJsonInPlace('a={"x":1} b={"y":2}');
  expect(r.output).toBe('a={\n  "x": 1\n} b={\n  "y": 2\n}');
});

test('formatJsonInPlace: 랩 줄바꿈 낀 블록은 복구해 펼치고 경고를 남긴다', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const r = formatJsonInPlace('body={"a":"b\nc"} 뒤');
  expect(r.output).toBe('body={\n  "a": "bc"\n} 뒤');
  expect(r.diagnostics.some((d) => d.severity === 'warning' && d.message.includes('줄바꿈'))).toBe(true);
});

test('formatJsonInPlace: 전체가 단일 JSON이면 통짜 정렬과 동일', async () => {
  const { formatJsonInPlace, formatJson } = await import('../src/format/json');
  expect(formatJsonInPlace('{"a":1}').output).toBe(formatJson('{"a":1}').output);
});

test('formatJsonInPlace: JSON이 없으면 기존 진단 경로 그대로', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const r = formatJsonInPlace('그냥 텍스트');
  expect(r.output).toBeUndefined();
  expect(r.diagnostics.length).toBeGreaterThan(0);
});

test('formatJsonInPlace: 관용 복구(내용 손실 위험)는 본문을 바꾸지 않고 진단만', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const r = formatJsonInPlace('{"a":1 "b":2}'); // 콤마 누락 단일 문서 → 원본 유지 중엔 보류
  expect(r.output).toBeUndefined();
  expect(r.diagnostics.length).toBeGreaterThan(0);
});

test('formatJsonInPlace: 중복 키 단일 문서는 병합하지 않고 보류', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const r = formatJsonInPlace('{"a":1,"a":2}');
  expect(r.output).toBeUndefined();
  expect(r.diagnostics.some((d) => d.message.includes('중복 키'))).toBe(true);
});
