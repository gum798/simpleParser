import { test, expect, beforeEach } from 'vitest';
import { loadRules, saveRules } from '../src/highlight/store';
import type { HighlightRule } from '../src/highlight/matcher';

const r: HighlightRule = { id: 'a', name: 'n', regex: 'x', enabled: true, textColor: '#000000', bgColor: '#ffff00' };

beforeEach(() => localStorage.clear());

test('save → load 라운드트립', () => {
  saveRules([r]);
  expect(loadRules()).toEqual([r]);
});

test('없으면 빈 배열', () => {
  expect(loadRules()).toEqual([]);
});

test('손상된 값은 빈 배열', () => {
  localStorage.setItem('simpleparser.highlightRules', '{not json');
  expect(loadRules()).toEqual([]);
});

test('배열이지만 형식이 틀린 항목은 걸러냄', () => {
  localStorage.setItem('simpleparser.highlightRules', JSON.stringify([r, { id: 1 }]));
  expect(loadRules()).toEqual([r]);
});
