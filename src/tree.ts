import { parseTree, type Node as JsoncNode } from 'jsonc-parser';
import { parseDocument, isMap, isSeq, isScalar } from 'yaml';
import { findHighlights, markStyle, type CompiledRule } from './highlight/matcher';
import type { Diagnostic, Format, TreeNode, TreeResult } from './types';
import {
  extractJsonSpans,
  scanTopLevel,
  parseJsonTolerant,
  repairJsonStringNewlines,
  mapRepairedOffset,
} from './format/json';
import { parseYamlTolerant } from './format/yaml';
import { xmlDiagnostics } from './format/xml';

export function buildTree(text: string, fmt: Format): TreeResult {
  switch (fmt) {
    case 'json':
      return jsonTree(text);
    case 'yaml':
      return yamlTree(text);
    case 'xml':
      return domTree(text, 'application/xml');
    case 'html':
      return domTree(text, 'text/html');
    case 'markdown':
      return { diagnostics: [{ message: 'Markdown은 트리뷰 대신 미리보기를 사용합니다', severity: 'warning' }] };
  }
}

function jsonTree(text: string): TreeResult {
  let validWhole = false;
  try {
    JSON.parse(text);
    validWhole = true;
  } catch {
    /* not strictly valid */
  }

  // 문자열 안 랩 줄바꿈만 제거하면 유효해지는 문서 → 복구본으로 파싱, pos는 원본 좌표로 보정.
  // resolveJson과 동일하게 스팬 게이트보다 먼저 시도한다(괄호 없는 최상위 스칼라는 스팬이 0개).
  if (!validWhole) {
    const rep = repairJsonStringNewlines(text);
    if (rep.removed.length > 0) {
      try {
        JSON.parse(rep.text);
        const node = parseTree(rep.text, undefined, { allowTrailingComma: true });
        if (node) {
          const root = jsoncToTree(node, undefined, 0, rep.removed);
          root.partial = true; // 내용을 고친 복구
          return {
            root,
            diagnostics: [
              {
                message: `문자열 안의 줄바꿈 ${rep.removed.length}개를 제거해 복구했습니다(터미널 랩 복사 추정)`,
                severity: 'warning',
              },
            ],
          };
        }
      } catch {
        /* 랩 복구로도 안 됨 → 기존 관용 경로로 */
      }
    }
  }

  const { spans, recoverFrom, mismatched } = scanTopLevel(text, 0);
  const isWholeSingleSpan =
    spans.length === 1 &&
    text.slice(0, spans[0][0]).trim() === '' &&
    text.slice(spans[0][1] + 1).trim() === '';
  // 전체가 하나의 잘린(닫히지 않은) 문서면 조각 추출이 아니라 관용 전체 트리(resolveJson과 동일 라우팅)
  const isTruncatedWholeDoc =
    spans.length === 0 && recoverFrom !== null && text.slice(0, recoverFrom).trim() === '';

  if (validWhole || isWholeSingleSpan || isTruncatedWholeDoc) {
    const node = parseTree(text, undefined, { allowTrailingComma: true });
    if (!node) return fromValue(parseJsonTolerant(text));
    const root = jsoncToTree(node, undefined, 0);
    const { diagnostics } = parseJsonTolerant(text);
    if (diagnostics.length > 0) root.partial = true;
    return { root, diagnostics };
  }

  // 로그/텍스트 추출 모드: 블록별 parseTree + 절대 오프셋(복구 블록은 removed로 원본 좌표 보정)
  const blocks = extractJsonSpans(text);
  // resolveJson과 동일 게이트: 보충 스팬'만' 있는데 문서에 다른 JSON 구조 흔적(균형
  // 스팬·괄호 불일치)이 있으면 조각 트리 대신 관용 전체 트리로.
  const hasReal = blocks.some((b) => !b.appended);
  const salvageOnlyOk = spans.length === 0 && !mismatched;
  if (blocks.length === 0 || (!hasReal && !salvageOnlyOk)) return fromValue(parseJsonTolerant(text));
  let completed = 0;
  let trimmedChars = 0;
  const nodes = blocks
    .map((b) => {
      const n = parseTree(b.text, undefined, { allowTrailingComma: true });
      if (!n) return null;
      // 보충 복구 블록: 덧붙인 닫는 괄호가 원본 밖 좌표를 만들지 않게 pos 상한을 건다
      const cap = b.appended ? b.text.length - b.appended : undefined;
      const t = jsoncToTree(n, undefined, b.start, b.removed, cap);
      if (b.appended) {
        t.partial = true; // 괄호를 보충한 결과임을 표시(정렬 경로와 동일 신호)
        completed++;
        trimmedChars += b.trimmed ?? 0;
      }
      return t;
    })
    .filter((n): n is TreeNode => n !== null);
  if (nodes.length === 0) return fromValue(parseJsonTolerant(text));
  const root = nodes.length === 1 ? nodes[0] : { type: 'array' as const, children: nodes };
  const diagnostics: Diagnostic[] = completed
    ? [
        {
          message:
            `잘린 JSON 블록 ${completed}개의 닫는 괄호를 보충해 복구했습니다(로거 절단 추정)` +
            (trimmedChars ? ` — 파싱 불가한 꼬리 ${trimmedChars}자는 버렸습니다(마지막 값이 잘렸을 수 있음)` : ''),
          severity: 'warning',
        },
      ]
    : [];
  return { root, diagnostics };
}

// removed: 파싱한 텍스트가 랩 줄바꿈 복구본일 때, 제거분을 되돌려 원본 좌표의 pos를 만들기 위한 오프셋들
function jsoncToTree(node: JsoncNode, key: string | undefined, base: number, removed?: number[], capOff?: number): TreeNode {
  const abs = (off: number): number => {
    const mapped = removed?.length ? mapRepairedOffset(removed, off) : off;
    return base + (capOff !== undefined ? Math.min(mapped, capOff) : mapped);
  };
  const pos = { from: abs(node.offset), to: abs(node.offset + node.length) };
  if (node.type === 'object') {
    const children = (node.children ?? []).map((prop) => {
      const k = String(prop.children?.[0]?.value ?? '');
      const valNode = prop.children?.[1];
      if (valNode) return jsoncToTree(valNode, k, base, removed, capOff);
      return {
        key: k,
        type: 'scalar' as const,
        value: '',
        pos: { from: abs(prop.offset), to: abs(prop.offset + prop.length) },
      };
    });
    return { key, type: 'object', pos, children };
  }
  if (node.type === 'array') {
    return {
      key,
      type: 'array',
      pos,
      children: (node.children ?? []).map((c, i) => jsoncToTree(c, String(i), base, removed, capOff)),
    };
  }
  return { key, type: 'scalar', value: node.type === 'null' ? 'null' : String(node.value), pos };
}

function yamlTree(text: string): TreeResult {
  const { diagnostics } = parseYamlTolerant(text);
  const doc = parseDocument(text, { prettyErrors: true });
  if (doc.contents == null) return { diagnostics };
  const root = yamlNodeToTree(doc.contents, undefined);
  if (diagnostics.length > 0) root.partial = true;
  return { root, diagnostics };
}

function yamlNodeToTree(node: unknown, key: string | undefined): TreeNode {
  if (node == null) return { key, type: 'scalar', value: 'null' };
  const range = (node as { range?: [number, number, number] | null }).range ?? undefined;
  const pos = range ? { from: range[0], to: range[1] } : undefined;
  if (isMap(node)) {
    return {
      key,
      type: 'object',
      pos,
      children: node.items.map((pair) => {
        const k = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
        return yamlNodeToTree(pair.value, k);
      }),
    };
  }
  if (isSeq(node)) {
    return { key, type: 'array', pos, children: node.items.map((it, i) => yamlNodeToTree(it, String(i))) };
  }
  if (isScalar(node)) {
    return { key, type: 'scalar', value: node.value === null ? 'null' : String(node.value), pos };
  }
  return { key, type: 'scalar', value: String(node), pos }; // node != null (상단 가드)
}

function fromValue(parsed: { value: unknown; diagnostics: Diagnostic[] }): TreeResult {
  if (parsed.value === undefined) return { diagnostics: parsed.diagnostics };
  const root = valueToNode(parsed.value);
  if (parsed.diagnostics.length > 0) root.partial = true; // 복구된 트리는 partial 표시
  return { root, diagnostics: parsed.diagnostics };
}

function valueToNode(value: unknown, key?: string): TreeNode {
  if (Array.isArray(value)) {
    return { key, type: 'array', children: value.map((v, i) => valueToNode(v, String(i))) };
  }
  if (value !== null && typeof value === 'object') {
    return {
      key,
      type: 'object',
      children: Object.entries(value as Record<string, unknown>).map(([k, v]) => valueToNode(v, k)),
    };
  }
  return { key, type: 'scalar', value: value === null ? 'null' : String(value) };
}

function domTree(text: string, mime: 'application/xml' | 'text/html'): TreeResult {
  const doc = new DOMParser().parseFromString(text, mime);
  if (mime === 'application/xml') {
    const diagnostics = xmlDiagnostics(text);
    if (diagnostics.length > 0) {
      // 엄격 파싱 실패 → 관용(html) 파싱으로 부분 트리
      const lenient = new DOMParser().parseFromString(text, 'text/html');
      const body = lenient.body;
      const root = body ? elementToNode(body) : undefined;
      if (root) root.partial = true;
      return { root, diagnostics };
    }
    return { root: elementToNode(doc.documentElement), diagnostics: [] };
  }
  const body = doc.body;
  return { root: body ? elementToNode(body) : undefined, diagnostics: [] };
}

function elementToNode(el: Element): TreeNode {
  const children: TreeNode[] = [];
  for (const attr of Array.from(el.attributes)) {
    children.push({ key: `@${attr.name}`, type: 'scalar', value: attr.value });
  }
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      children.push(elementToNode(child as Element));
    } else if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent?.trim();
      if (t) children.push({ type: 'scalar', value: t });
    }
  }
  return {
    key: el.tagName.toLowerCase(),
    type: 'element',
    children: children.length ? children : undefined,
  };
}

/** 트리의 최대 깊이(루트=0, 자식 한 단계마다 +1). */
export function maxDepth(node: TreeNode): number {
  if (!node.children || node.children.length === 0) return 0;
  let deepest = 0;
  for (const c of node.children) deepest = Math.max(deepest, maxDepth(c));
  return deepest + 1;
}

/** 텍스트에 하이라이트 규칙을 적용한 프래그먼트(겹치는 매칭은 앞선 것 우선).
 *  트리 라벨과 OUTPUT 텍스트 뷰가 같은 규칙 색을 쓰도록 공유한다. */
export function highlightText(text: string, compiled: CompiledRule[]): DocumentFragment | string {
  if (!compiled.some((c) => c.re)) return text;
  const spans = findHighlights(text, compiled).sort((a, b) => a.from - b.from || b.to - a.to);
  if (spans.length === 0) return text;
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const s of spans) {
    if (s.from < pos) continue; // 겹침 → 이미 칠한 구간 유지
    if (s.from > pos) frag.append(text.slice(pos, s.from));
    const m = document.createElement('span');
    m.setAttribute('style', markStyle(s.rule)); // 색은 store에서 #rrggbb 검증됨
    m.textContent = text.slice(s.from, s.to);
    frag.append(m);
    pos = s.to;
  }
  if (pos < text.length) frag.append(text.slice(pos));
  return frag;
}

/**
 * expandDepth = 자식을 펼쳐 보여줄 단계 수. 깊이 expandDepth 이상인 노드는 접힌 채 시작
 * (수동 토글로 열 수 있음). 생략하면 전부 펼침. rules를 주면 라벨에도 하이라이트 적용.
 */
export function renderTree(
  root: TreeNode,
  onJump: (node: TreeNode) => void,
  expandDepth = Infinity,
  rules: CompiledRule[] = [],
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tree';
  container.appendChild(renderNode(root, onJump, 0, expandDepth, rules));
  return container;
}

function renderNode(
  node: TreeNode,
  onJump: (node: TreeNode) => void,
  depth: number,
  expandDepth: number,
  rules: CompiledRule[],
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tree-node' + (node.partial ? ' partial' : '');
  const keyPart = node.key !== undefined ? `${node.key}: ` : '';
  const label = document.createElement('span');
  label.className = 'tree-label';
  label.addEventListener('click', () => onJump(node));

  if (node.children && node.children.length) {
    const collapsed = depth >= expandDepth; // 뎁스 컨트롤: 이 깊이부터 접힘
    const toggle = document.createElement('button');
    toggle.className = 'tree-toggle';
    toggle.textContent = collapsed ? '▸' : '▾';
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    if (collapsed) childrenEl.style.display = 'none';
    node.children.forEach((c) => childrenEl.appendChild(renderNode(c, onJump, depth + 1, expandDepth, rules)));
    toggle.addEventListener('click', () => {
      const hidden = childrenEl.style.display === 'none';
      childrenEl.style.display = hidden ? '' : 'none';
      toggle.textContent = hidden ? '▾' : '▸';
    });
    label.append(highlightText(`${keyPart}${typeLabel(node)}`, rules));
    el.append(toggle, label, childrenEl);
  } else {
    label.append(highlightText(`${keyPart}${node.value ?? typeLabel(node)}`, rules));
    el.append(label);
  }
  return el;
}

function typeLabel(node: TreeNode): string {
  switch (node.type) {
    case 'array':
      return `[${node.children?.length ?? 0}]`;
    case 'object':
      return `{${node.children?.length ?? 0}}`;
    case 'element':
      return `<${node.key ?? ''}>`;
    default:
      return node.value ?? '';
  }
}
