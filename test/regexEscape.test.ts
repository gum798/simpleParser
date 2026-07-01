import { test, expect } from 'vitest';
import { regexEscape } from '../src/util/regexEscape';
import safeRegex from 'safe-regex';

test('정규식 특수문자를 리터럴로 이스케이프', () => {
  expect(regexEscape('a.b')).toBe('a\\.b');
  expect(regexEscape('$100 (x)')).toBe('\\$100 \\(x\\)');
  expect(regexEscape('a+b*c?')).toBe('a\\+b\\*c\\?');
  expect(regexEscape('[x]{2}')).toBe('\\[x\\]\\{2\\}');
});

test('이스케이프 결과는 원문과 정확히 매칭되고 ReDoS 안전', () => {
  const s = 'value: $1.50 (USD) [tax]';
  const re = new RegExp(regexEscape(s), 'g');
  expect(`x ${s} y ${s}`.match(re)).toHaveLength(2);
  expect(safeRegex(regexEscape(s))).toBe(true);
});
