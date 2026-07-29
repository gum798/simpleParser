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

test('문자열 안 줄바꿈(터미널 랩)이 낀 로그 JSON도 온전한 트리 + 보정된 원본 pos', () => {
  const text = 'body=\n{"a":"x\ny","b":[1,2]}';
  const r = buildTree(text, 'json');
  expect(r.root?.type).toBe('object');
  expect(r.root?.children?.map((c) => c.key)).toEqual(['a', 'b']);
  const a = r.root?.children?.find((c) => c.key === 'a')!;
  expect(a.value).toBe('xy'); // 랩 줄바꿈 제거로 복원된 값
  const b = r.root?.children?.find((c) => c.key === 'b')!;
  expect(text.slice(b.pos!.from, b.pos!.to)).toBe('[1,2]'); // 제거분을 보정한 원본 오프셋
});

test('전체가 랩된 JSON(접두어 없음)도 복구 트리 + partial 표시', () => {
  const text = '{"key":"ab\ncd","n":1}';
  const r = buildTree(text, 'json');
  expect(r.root?.type).toBe('object');
  expect(r.root?.partial).toBe(true); // 내용을 고친 복구임을 표시
  const k = r.root?.children?.find((c) => c.key === 'key')!;
  expect(k.value).toBe('abcd');
  const n = r.root?.children?.find((c) => c.key === 'n')!;
  expect(text.slice(n.pos!.from, n.pos!.to)).toBe('1');
});

test('괄호 없는 최상위 문자열 스칼라의 랩 줄바꿈도 트리에서 복구(포맷 경로와 동일 라우팅)', () => {
  const r = buildTree('"line1\nline2"', 'json'); // topLevelSpans가 0개여도 복구 경로를 타야 함
  expect(r.root?.type).toBe('scalar');
  expect(r.root?.value).toBe('line1line2');
  expect(r.root?.partial).toBe(true);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
});

test('YAML 트리 노드는 정확한 소스 pos를 가진다', () => {
  const text = 'a: 1\nb: two';
  const r = buildTree(text, 'yaml');
  const b = r.root?.children?.find((c) => c.key === 'b')!;
  expect(text.slice(b.pos!.from, b.pos!.to)).toBe('two');
});

test('값 없는 YAML 키도 크래시 없이 트리(null)로', () => {
  const r = buildTree('{a: 1, b}', 'yaml'); // b는 값 없는 키 → AST에서 JS null
  expect(r.root?.type).toBe('object');
  const b = r.root?.children?.find((c) => c.key === 'b');
  expect(b?.value).toBe('null');
});

test('renderTree는 접이식 DOM을 만든다', () => {
  const r = buildTree('{"a":1}', 'json');
  const el = renderTree(r.root!, () => {});
  expect(el.querySelectorAll('.tree-node').length).toBeGreaterThan(0);
  const toggle = el.querySelector('.tree-toggle') as HTMLButtonElement;
  const children = el.querySelector('.tree-children') as HTMLElement;
  expect(children.style.display).not.toBe('none');
  toggle.click();
  expect(children.style.display).toBe('none');
});

test('트리 라벨 클릭 시 onJump(node) 호출', () => {
  const r = buildTree('{"a":1}', 'json');
  const calls: string[] = [];
  const el = renderTree(r.root!, (n) => calls.push(n.key ?? n.type));
  (el.querySelector('.tree-label') as HTMLElement).click();
  expect(calls.length).toBeGreaterThan(0);
});

test('maxDepth: 루트=0, 자식 단계마다 +1', async () => {
  const { maxDepth, buildTree } = await import('../src/tree');
  expect(maxDepth({ type: 'scalar', value: '1' })).toBe(0);
  const flat = buildTree('{"a":1,"b":2}', 'json').root!;
  expect(maxDepth(flat)).toBe(1);
  const deep = buildTree('{"a":{"b":{"c":{"d":1}}}}', 'json').root!;
  expect(maxDepth(deep)).toBe(4);
});

test('renderTree(expandDepth): 지정 깊이부터 접힌 채 렌더', async () => {
  const { renderTree, buildTree } = await import('../src/tree');
  const root = buildTree('{"a":{"b":{"c":1}}}', 'json').root!;
  const el = renderTree(root, () => {}, 1); // 루트만 펼침 → a(깊이1)는 접힘
  const nodes = el.querySelectorAll('.tree-children');
  // 루트의 children은 보임, a의 children은 숨김
  expect((nodes[0] as HTMLElement).style.display).toBe('');
  expect((nodes[1] as HTMLElement).style.display).toBe('none');
  // 접힌 노드 토글은 ▸ 표시
  const toggles = el.querySelectorAll('.tree-toggle');
  expect(toggles[0].textContent).toBe('▾');
  expect(toggles[1].textContent).toBe('▸');
});

test('renderTree(rules): 라벨의 매칭 텍스트에 규칙 색 적용', async () => {
  const { renderTree, buildTree } = await import('../src/tree');
  const { compileRules } = await import('../src/highlight/matcher');
  const root = buildTree('{"stage":"MODE_A","ok":true}', 'json').root!;
  const compiled = compileRules([
    { id: '1', name: '', regex: 'stage', enabled: true, textColor: '#ff0000', bgColor: '#ffff00' },
  ]);
  const el = renderTree(root, () => {}, Infinity, compiled);
  const marks = Array.from(el.querySelectorAll('.tree-label span'));
  expect(marks.length).toBeGreaterThan(0);
  expect(marks[0].textContent).toBe('stage');
  expect(marks[0].getAttribute('style')).toContain('color:#ff0000');
  expect(marks[0].getAttribute('style')).toContain('background-color:#ffff00');
  // 매칭 밖 텍스트는 그대로 유지
  const label = marks[0].closest('.tree-label')!;
  expect(label.textContent).toContain('stage: MODE_A');
});

test('renderTree(rules): 규칙 없으면 span 없이 순수 텍스트', async () => {
  const { renderTree, buildTree } = await import('../src/tree');
  const root = buildTree('{"a":1}', 'json').root!;
  const el = renderTree(root, () => {});
  expect(el.querySelectorAll('.tree-label span').length).toBe(0);
});

test('highlightText: 규칙 매칭 구간에 색 span, 규칙 없으면 순수 문자열', async () => {
  const { highlightText } = await import('../src/tree');
  const { compileRules } = await import('../src/highlight/matcher');
  const compiled = compileRules([
    { id: '1', name: '', regex: 'stage', enabled: true, textColor: '#ff0000', bgColor: '#ffff00' },
  ]);
  const frag = highlightText('{"stage":"A"}\n{"stage":"B"}', compiled);
  const div = document.createElement('div');
  div.append(frag);
  const spans = div.querySelectorAll('span');
  expect(spans.length).toBe(2); // 두 줄의 stage 모두
  expect(spans[0].textContent).toBe('stage');
  expect(spans[0].getAttribute('style')).toContain('background-color:#ffff00');
  expect(div.textContent).toBe('{"stage":"A"}\n{"stage":"B"}'); // 매칭 밖 텍스트 보존
  expect(highlightText('abc', [])).toBe('abc'); // 규칙 없음 → 문자열 그대로
});

test('전체가 하나의 잘린 JSON 문서면 트리도 조각 배열이 아니라 문서 트리(포맷 경로와 동일 라우팅)', () => {
  const doc = '{\n  "openapi": "3.1.0",\n  "info": {"title": "T"},\n  "desc": "cut…';
  const r = buildTree(doc, 'json');
  expect(r.root?.type).toBe('object');
  expect(r.root?.children?.map((c) => c.key)).toContain('openapi');
});
