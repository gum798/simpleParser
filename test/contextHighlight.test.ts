import { test, expect } from 'vitest';
import { truncateLabel, PALETTE } from '../src/contextHighlight';

test('truncateLabel: 공백 정리 후 축약', () => {
  expect(truncateLabel('a\n  b   c')).toBe('a b c');
  expect(truncateLabel('x'.repeat(30), 10)).toBe('xxxxxxxxxx…');
  expect(truncateLabel('  hi  ')).toBe('hi');
});

test('PALETTE 색은 모두 #rrggbb — store isRule 통과 · style 주입 방어', () => {
  const HEX = /^#[0-9a-fA-F]{6}$/;
  for (const c of PALETTE) {
    expect(HEX.test(c.bg)).toBe(true);
    expect(HEX.test(c.text)).toBe(true);
  }
});

test('PALETTE는 12색 — 6열 × 2줄', () => {
  expect(PALETTE).toHaveLength(12);
});
