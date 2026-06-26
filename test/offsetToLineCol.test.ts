import { test, expect } from 'vitest';
import { offsetToLineCol } from '../src/util/offsetToLineCol';

test('오프셋 0은 1행 1열', () => {
  expect(offsetToLineCol('abc', 0)).toEqual({ line: 1, col: 1 });
});

test('첫 줄 안의 오프셋', () => {
  expect(offsetToLineCol('abc', 2)).toEqual({ line: 1, col: 3 });
});

test('개행 다음 줄의 시작', () => {
  expect(offsetToLineCol('ab\ncd', 3)).toEqual({ line: 2, col: 1 });
});

test('범위를 넘는 오프셋은 끝으로 클램프', () => {
  expect(offsetToLineCol('ab\ncd', 999)).toEqual({ line: 2, col: 3 });
});
