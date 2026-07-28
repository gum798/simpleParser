import { test, expect } from 'vitest';
import {
  canFormat,
  viewLabel,
  formatDiagnosticLine,
  saveMessage,
  shouldAutoFormat,
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


test('뷰 라벨: 열릴 뷰와 일치(텍스트 뷰면 [텍스트], markdown은 항상 미리보기)', () => {
  expect(viewLabel('json', 'text')).toBe('텍스트');
  expect(viewLabel('json', 'tree')).toBe('트리');
  expect(viewLabel('markdown', 'text')).toBe('미리보기');
});
