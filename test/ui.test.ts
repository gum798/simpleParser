import { test, expect } from 'vitest';
import { canFormat, viewLabel, formatDiagnosticLine, saveMessage } from '../src/ui';

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
