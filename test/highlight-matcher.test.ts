import { test, expect } from 'vitest';
import { isValidRegex, compileRules, findHighlights, type HighlightRule } from '../src/highlight/matcher';

function rule(p: Partial<HighlightRule>): HighlightRule {
  return { id: 'x', name: '', regex: '', enabled: true, textColor: '#000000', bgColor: '#ffff00', ...p };
}

test('isValidRegex: 유효/무효/빈값', () => {
  expect(isValidRegex('a.*b')).toBe(true);
  expect(isValidRegex('(')).toBe(false);
  expect(isValidRegex('')).toBe(true);
});

test('findHighlights: 전역 다중 매칭 범위', () => {
  const spans = findHighlights('hello hi hello', compileRules([rule({ regex: 'hello' })]));
  expect(spans.map((s) => [s.from, s.to])).toEqual([[0, 5], [9, 14]]);
});

test('findHighlights: 비활성/무효 규칙 제외, 크래시 없음', () => {
  const spans = findHighlights('aaa', compileRules([
    rule({ regex: 'a', enabled: false }),
    rule({ regex: '(' }), // 무효
  ]));
  expect(spans).toHaveLength(0);
});

test('findHighlights: 여러 규칙이 겹쳐도 각각 span', () => {
  const spans = findHighlights('abc', compileRules([rule({ id: 'r1', regex: 'ab' }), rule({ id: 'r2', regex: 'bc' })]));
  expect(spans).toHaveLength(2);
});

test('findHighlights: zero-length 정규식도 무한루프 없이 종료', () => {
  const spans = findHighlights('aa', compileRules([rule({ regex: 'a*' })]));
  expect(spans).toEqual([{ from: 0, to: 2, rule: expect.objectContaining({ regex: 'a*' }) }]);
});

test('compileRules: 파국적 백트래킹 정규식은 컴파일 거부(ReDoS 방어)', () => {
  // 공유 URL로 전달될 수 있는 악성 패턴 → 매칭하지 않음(re:null), 탭 멈춤 방지
  const compiled = compileRules([rule({ regex: '(a+)+$' })]);
  expect(compiled[0]!.re).toBeNull();
  // 같은 입력에서도 매칭이 발생하지 않아 메인스레드가 멈추지 않는다
  const spans = findHighlights('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!', compiled);
  expect(spans).toHaveLength(0);
});

test('compileRules: 일반 정규식은 정상 컴파일', () => {
  const compiled = compileRules([rule({ regex: 'error|warn' })]);
  expect(compiled[0]!.re).not.toBeNull();
});
