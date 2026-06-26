import { test, expect } from 'vitest';

test('vitest + jsdom 환경이 동작한다', () => {
  const el = document.createElement('div');
  el.textContent = 'ok';
  expect(el.textContent).toBe('ok');
  expect(typeof DOMParser).toBe('function');
});
