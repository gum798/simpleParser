import { test, expect } from 'vitest';
import {
  canFormat,
  viewLabel,
  formatDiagnosticLine,
  saveMessage,
  shouldAutoFormat,
  isReindentOnly,
  AUTO_FORMAT_MAX,
} from '../src/ui';

test('markdown은 정렬 불가, 나머지는 가능', () => {
  expect(canFormat('markdown')).toBe(false);
  expect(canFormat('json')).toBe(true);
});

test('뷰 라벨은 포맷에 따라 달라진다', () => {
  expect(viewLabel('markdown')).toBe('미리보기');
  expect(viewLabel('xml')).toBe('트리');
});

test('진단 요약은 첫 에러의 줄:열을 보여준다', () => {
  const line = formatDiagnosticLine([
    { message: '콤마 누락', line: 3, col: 5, severity: 'error' },
  ]);
  expect(line).toContain('3');
  expect(line).toContain('5');
  expect(line).toContain('콤마 누락');
});

test('진단이 없으면 OK 표시', () => {
  expect(formatDiagnosticLine([])).toMatch(/문제\s*없음|OK/);
});

test('저장 안내 메시지는 복사 성공/실패에 따라 달라진다', () => {
  expect(saveMessage(true)).toContain('복사되었습니다');
  expect(saveMessage(false)).toContain('직접 복사');
});

test('작은 정렬 가능 입력은 자동 정렬 대상', () => {
  expect(shouldAutoFormat('{"a":1}', 'json')).toBe(true);
});

test('빈/공백 입력은 자동 정렬 안 함', () => {
  expect(shouldAutoFormat('', 'json')).toBe(false);
  expect(shouldAutoFormat('   \n  ', 'json')).toBe(false);
});

test('정렬 불가 포맷(마크다운)은 자동 정렬 안 함(로그 붙여넣기 보호)', () => {
  expect(shouldAutoFormat('# 제목\n로그 본문', 'markdown')).toBe(false);
});

test('임계값을 넘는 큰 입력은 자동 정렬 안 함(저부하)', () => {
  const big = '{"a":"' + 'x'.repeat(AUTO_FORMAT_MAX) + '"}';
  expect(big.length).toBeGreaterThan(AUTO_FORMAT_MAX);
  expect(shouldAutoFormat(big, 'json')).toBe(false);
});

test('들여쓰기만 다르면 비파괴 정렬로 인정(자동 적용 OK)', () => {
  expect(isReindentOnly('{"a":1,"b":[2,3]}', '{\n  "a": 1,\n  "b": [2, 3]\n}')).toBe(true);
});

test('문자열 내부 공백은 양쪽에서 동일 제거되어 보존으로 인정', () => {
  expect(isReindentOnly('{"a":"hello world"}', '{\n  "a": "hello world"\n}')).toBe(true);
});

test('주변 텍스트가 사라지면 비파괴 아님(로그 속 JSON 추출 자동 저지름 방지)', () => {
  expect(isReindentOnly('로그 {"a":1} 끝', '{\n  "a": 1\n}')).toBe(false);
});

test('주석/중복키 제거는 비파괴 아님(자동 정렬 보류 대상)', () => {
  expect(isReindentOnly('{"a":1 // 메모\n}', '{\n  "a": 1\n}')).toBe(false);
  expect(isReindentOnly('{"a":1,"a":2}', '{\n  "a": 2\n}')).toBe(false);
});
