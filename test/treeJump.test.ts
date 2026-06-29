import { test, expect } from 'vitest';
import { approxFind } from '../src/treeJump';
import type { TreeNode } from '../src/types';

const xml = '<note id="x"><to>Tove</to></note>';

test('element 노드는 태그 이름 위치를 찾는다(< 제외)', () => {
  const node: TreeNode = { key: 'to', type: 'element' };
  const r = approxFind(xml, node)!;
  expect(xml.slice(r.from, r.to)).toBe('to'); // '<to'에서 이름 'to'만 선택(@attr→이름과 일관)
});

test('scalar 노드는 값 텍스트를 찾는다', () => {
  const node: TreeNode = { type: 'scalar', value: 'Tove' };
  const r = approxFind(xml, node)!;
  expect(xml.slice(r.from, r.to)).toBe('Tove');
});

test('속성 노드(@id)는 attr= 를 찾는다', () => {
  const node: TreeNode = { key: '@id', type: 'scalar', value: 'x' };
  const r = approxFind(xml, node)!;
  expect(xml.slice(r.from, r.to)).toBe('id');
});

test('못 찾으면 null', () => {
  expect(approxFind(xml, { type: 'scalar', value: '없음' })).toBeNull();
  expect(approxFind(xml, { type: 'object' })).toBeNull();
});
