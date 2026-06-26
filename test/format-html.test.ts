import { test, expect } from 'vitest';
import { formatHtml } from '../src/format/html';
import { format } from '../src/format/index';

test('지저분한 HTML을 들여쓰기', () => {
  const r = formatHtml('<div><p>hi</p></div>');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toContain('\n  <p>hi</p>');
});

test('HTML은 어떤 입력도 진단 없이 정렬', () => {
  const r = formatHtml('<div><p>안 닫힘');
  expect(r.diagnostics).toHaveLength(0);
  expect(typeof r.output).toBe('string');
});

test('markdown 디스패치는 원문을 그대로 반환', () => {
  const r = format('# 제목', 'markdown');
  expect(r.output).toBe('# 제목');
  expect(r.diagnostics).toHaveLength(0);
});

test('디스패처가 html을 라우팅', () => {
  expect(format('<div><p>hi</p></div>', 'html').output).toContain('<p>hi</p>');
});
