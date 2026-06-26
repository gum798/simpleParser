import { test, expect } from 'vitest';
import { toCmDiagnostics } from '../src/editor';

test('offset/length를 from/to로 매핑', () => {
  const out = toCmDiagnostics('hello world', [
    { message: 'bad', offset: 6, length: 5, severity: 'error' },
  ]);
  expect(out[0]).toMatchObject({ from: 6, to: 11, severity: 'error', message: 'bad' });
});

test('offset 없는 진단은 인라인에서 제외(상태줄 메시지로만 표시)', () => {
  const out = toCmDiagnostics('abc', [{ message: 'x', severity: 'warning' }]);
  expect(out).toHaveLength(0);
});

test('to는 텍스트 길이로 클램프', () => {
  const out = toCmDiagnostics('ab', [{ message: 'x', offset: 1, length: 99, severity: 'error' }]);
  expect(out[0].to).toBe(2);
});
