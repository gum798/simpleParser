import { test, expect } from 'vitest';
import { buildTree, renderTree } from '../src/tree';

test('JSON 객체 → object 노드 + 자식', () => {
  const r = buildTree('{"a":1,"b":[2,3]}', 'json');
  expect(r.root?.type).toBe('object');
  expect(r.root?.children).toHaveLength(2);
  const b = r.root?.children?.find((c) => c.key === 'b');
  expect(b?.type).toBe('array');
  expect(b?.children).toHaveLength(2);
});

test('YAML 맵 → object 노드', () => {
  const r = buildTree('a: 1\nb: 2', 'yaml');
  expect(r.root?.type).toBe('object');
  expect(r.root?.children?.map((c) => c.key)).toEqual(['a', 'b']);
});

test('XML → element 노드(속성은 @접두 스칼라)', () => {
  const r = buildTree('<a id="x"><b>1</b></a>', 'xml');
  expect(r.root?.type).toBe('element');
  expect(r.root?.key).toBe('a');
  expect(r.root?.children?.some((c) => c.key === '@id')).toBe(true);
});

test('잘못된 XML → 진단 + 부분 트리(partial)', () => {
  const r = buildTree('<a><b></a>', 'xml');
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(r.root?.partial).toBe(true);
});

test('복구된 JSON 트리는 partial 표시', () => {
  const r = buildTree('{"a":1 "b":2}', 'json'); // 콤마 누락 → 복구
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(r.root?.partial).toBe(true);
});

test('Markdown은 트리 대신 경고', () => {
  const r = buildTree('# x', 'markdown');
  expect(r.root).toBeUndefined();
  expect(r.diagnostics[0].severity).toBe('warning');
});

test('로그의 박힌 JSON들을 트리로(여러 개는 배열로 묶음)', () => {
  const r = buildTree('a body={"x":1} b body={"y":2}', 'json');
  expect(r.root?.type).toBe('array');
  expect(r.root?.children).toHaveLength(2);
});

test('JSON 트리 노드는 정확한 소스 pos를 가진다', () => {
  const text = '{"a":1,"b":[2,3]}';
  const r = buildTree(text, 'json');
  const a = r.root?.children?.find((c) => c.key === 'a')!;
  expect(text.slice(a.pos!.from, a.pos!.to)).toBe('1'); // a의 값 위치
  const b = r.root?.children?.find((c) => c.key === 'b')!;
  expect(text.slice(b.pos!.from, b.pos!.to)).toBe('[2,3]'); // b의 배열 위치
});

test('로그 추출 JSON도 절대 오프셋 pos', () => {
  const text = 'log body={"x":1} end';
  const r = buildTree(text, 'json');
  // 단일 블록이면 그 객체가 root
  expect(text.slice(r.root!.pos!.from, r.root!.pos!.to)).toBe('{"x":1}');
});

test('YAML 트리 노드는 정확한 소스 pos를 가진다', () => {
  const text = 'a: 1\nb: two';
  const r = buildTree(text, 'yaml');
  const b = r.root?.children?.find((c) => c.key === 'b')!;
  expect(text.slice(b.pos!.from, b.pos!.to)).toBe('two');
});

test('renderTree는 접이식 DOM을 만든다', () => {
  const r = buildTree('{"a":1}', 'json');
  const el = renderTree(r.root!);
  expect(el.querySelectorAll('.tree-node').length).toBeGreaterThan(0);
  const toggle = el.querySelector('.tree-toggle') as HTMLButtonElement;
  const children = el.querySelector('.tree-children') as HTMLElement;
  expect(children.style.display).not.toBe('none');
  toggle.click();
  expect(children.style.display).toBe('none');
});
