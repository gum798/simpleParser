import { test, expect } from 'vitest';
import { clampTheme, DEFAULT_THEME, loadTheme, saveTheme } from '../src/theme';

test('clampTheme: 범위 밖 값은 보정', () => {
  expect(clampTheme({ alpha: 5, blur: 999 })).toEqual({ alpha: 1, blur: 20 });
  expect(clampTheme({ alpha: -1, blur: -5 })).toEqual({ alpha: 0.2, blur: 0 });
});

test('clampTheme: 누락/비정상 값은 기본값', () => {
  expect(clampTheme({})).toEqual(DEFAULT_THEME);
  expect(clampTheme(null)).toEqual(DEFAULT_THEME);
  expect(clampTheme({ alpha: NaN, blur: 'x' as unknown as number })).toEqual(DEFAULT_THEME);
});

test('저장→로드 왕복', () => {
  saveTheme({ alpha: 0.5, blur: 12 });
  expect(loadTheme()).toEqual({ alpha: 0.5, blur: 12 });
});

test('저장값 없으면 기본 테마', () => {
  localStorage.removeItem('simpleparser.theme');
  expect(loadTheme()).toEqual(DEFAULT_THEME);
});
