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

test('formatJsonInPlace: 중복 키는 병합하지 않고 둘 다 그대로 유지(토큰 보존)', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const whole = formatJsonInPlace('{"a":1,"a":2}');
  expect(whole.output).toContain('"a": 1');
  expect(whole.output).toContain('"a": 2');
  const block = formatJsonInPlace('log {"a":1,"a":2} x'); // 주 시나리오(로그 속 블록)도 동일
  expect(block.output).toContain('"a": 1');
  expect(block.output).toContain('"a": 2');
});

test('formatJsonInPlace: 큰 정수·고정밀 소수·1.0·유니코드 이스케이프를 원문 그대로 보존', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const r = formatJsonInPlace('x={"id":12345678901234567890,"f":0.30000000000000004,"n":1.0,"e":"\\ud83d\\ude00"}');
  expect(r.output).toContain('"id": 12345678901234567890'); // JSON.parse 왕복이면 ...567168로 변형됨
  expect(r.output).toContain('"f": 0.30000000000000004');
  expect(r.output).toContain('"n": 1.0'); // 1로 정규화 금지
  expect(r.output).toContain('"e": "\\ud83d\\ude00"'); // 이스케이프 표기 유지
});

test('formatJsonInPlace: JSONC(후행 콤마·주석)는 보류하되 이유를 경고로 알린다', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  for (const src of ['{"a":1,}', '{"a":1 /*c*/}']) {
    const r = formatJsonInPlace(src);
    expect(r.output).toBeUndefined();
    expect(r.diagnostics.length).toBeGreaterThan(0); // 침묵 금지 — 상태줄에 보류 사유 표시
  }
});

test('formatKeepOriginal: 깨진 XML은 관용 재작성(태그 보정) 대신 보류 + 진단', async () => {
  const { formatKeepOriginal } = await import('../src/format/index');
  const r = formatKeepOriginal('<a><b></a>', 'xml'); // 관용 파서가 태그를 지어내는 입력
  expect(r.output).toBeUndefined();
  expect(r.diagnostics.length).toBeGreaterThan(0);
});

// ── 잘린 로그 라인 복원력: 닫히지 않은 블록/따옴표가 이후 문서를 삼키지 않게 ──

test('로거가 자른(닫히지 않은) 거대 JSON 라인 이후의 블록도 계속 추출한다', () => {
  const truncated = 'resp body={"openapi":"3.1.0","info":{"title":"T","desc":"cut here…(+40583자)';
  const text = 'a={"x":1}\n' + truncated + '\nb={"y":2}\nc={"z":3}';
  const blocks = extractJsonBlocks(text);
  expect(blocks).toEqual(expect.arrayContaining(['{"x":1}', '{"y":2}', '{"z":3}']));
});

test('formatJsonInPlace: 잘린 라인은 원문 그대로 두고 그 뒤 블록은 정상 정렬', async () => {
  const { formatJsonInPlace } = await import('../src/format/json');
  const truncated = 'resp body={"a":{"b":"cut…';
  const r = formatJsonInPlace('x={"p":1}\n' + truncated + '\ny={"q":2}');
  expect(r.output).toContain('"p": 1');
  expect(r.output).toContain('"q": 2'); // 잘린 라인 뒤도 계속 정렬
  expect(r.output).toContain('cut…'); // 잘린 라인은 손대지 않음
});

test('줄바꿈을 걸쳐 닫히는 인용문(랩된 로그 텍스트) 뒤의 블록도 추출한다', () => {
  // 리뷰 확정: 줄끝 문자열 리셋이 이 케이스를 회귀시켰음 — main 동작(줄바꿈 허용) 복원
  expect(extractJsonBlocks('msg="request failed for\nuser bob" body={"a":1}')).toEqual(['{"a":1}']);
});

test('전체가 하나의 잘린 JSON 문서면 조각 추출이 아니라 관용 복구(키·진단 유지)', () => {
  const doc = '{\n  "openapi": "3.1.0",\n  "info": {"title": "T", "version": "1"},\n  "desc": "cut…';
  const r = formatJson(doc);
  expect(r.output).toContain('"openapi"'); // 최상위 키 유지 — 내부 조각으로 대체 금지
  expect(r.diagnostics.length).toBeGreaterThan(0); // 잘렸다는 진단 유지
});
