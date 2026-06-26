import { test, expect } from 'vitest';
import { renderMarkdown } from '../src/preview';

test('제목을 <h1>로 렌더', () => {
  expect(renderMarkdown('# 제목').html).toContain('<h1');
});

test('목록을 <ul><li>로 렌더', () => {
  const html = renderMarkdown('- a\n- b').html;
  expect(html).toContain('<ul>');
  expect(html).toContain('<li>a</li>');
});

test('<script>는 정화로 제거', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n# ok').html;
  expect(html).not.toContain('<script>');
});

test('onerror 핸들러 제거', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>').html;
  expect(html.toLowerCase()).not.toContain('onerror');
});

test('javascript: 링크 제거', () => {
  const html = renderMarkdown('[클릭](javascript:alert(1))').html;
  expect(html.toLowerCase()).not.toContain('javascript:');
});
