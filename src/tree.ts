import { parseTree, type Node as JsoncNode } from 'jsonc-parser';
import type { Diagnostic, Format, TreeNode, TreeResult } from './types';
import { extractJsonSpans, topLevelSpans, parseJsonTolerant } from './format/json';
import { parseYamlTolerant } from './format/yaml';
import { xmlDiagnostics } from './format/xml';

export function buildTree(text: string, fmt: Format): TreeResult {
  switch (fmt) {
    case 'json':
      return jsonTree(text);
    case 'yaml':
      return fromValue(parseYamlTolerant(text));
    case 'xml':
      return domTree(text, 'application/xml');
    case 'html':
      return domTree(text, 'text/html');
    case 'markdown':
      return { diagnostics: [{ message: 'Markdown은 트리뷰 대신 미리보기를 사용합니다', severity: 'warning' }] };
  }
}

function jsonTree(text: string): TreeResult {
  const spans = topLevelSpans(text);
  const isWholeSingleSpan =
    spans.length === 1 &&
    text.slice(0, spans[0][0]).trim() === '' &&
    text.slice(spans[0][1] + 1).trim() === '';
  let validWhole = false;
  try {
    JSON.parse(text);
    validWhole = true;
  } catch {
    /* not strictly valid */
  }

  if (validWhole || isWholeSingleSpan) {
    const node = parseTree(text, undefined, { allowTrailingComma: true });
    if (!node) return fromValue(parseJsonTolerant(text));
    const root = jsoncToTree(node, undefined, 0);
    const { diagnostics } = parseJsonTolerant(text);
    if (diagnostics.length > 0) root.partial = true;
    return { root, diagnostics };
  }

  // 로그/텍스트 추출 모드: 블록별 parseTree + 절대 오프셋
  const blocks = extractJsonSpans(text);
  const nodes = blocks
    .map((b) => {
      const n = parseTree(b.text, undefined, { allowTrailingComma: true });
      return n ? jsoncToTree(n, undefined, b.start) : null;
    })
    .filter((n): n is TreeNode => n !== null);
  if (nodes.length === 0) return fromValue(parseJsonTolerant(text));
  const root = nodes.length === 1 ? nodes[0] : { type: 'array' as const, children: nodes };
  return { root, diagnostics: [] };
}

function jsoncToTree(node: JsoncNode, key: string | undefined, base: number): TreeNode {
  const pos = { from: base + node.offset, to: base + node.offset + node.length };
  if (node.type === 'object') {
    const children = (node.children ?? []).map((prop) => {
      const k = String(prop.children?.[0]?.value ?? '');
      const valNode = prop.children?.[1];
      if (valNode) return jsoncToTree(valNode, k, base);
      return {
        key: k,
        type: 'scalar' as const,
        value: '',
        pos: { from: base + prop.offset, to: base + prop.offset + prop.length },
      };
    });
    return { key, type: 'object', pos, children };
  }
  if (node.type === 'array') {
    return {
      key,
      type: 'array',
      pos,
      children: (node.children ?? []).map((c, i) => jsoncToTree(c, String(i), base)),
    };
  }
  return { key, type: 'scalar', value: node.type === 'null' ? 'null' : String(node.value), pos };
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

export function renderTree(root: TreeNode): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tree';
  container.appendChild(renderNode(root));
  return container;
}

function renderNode(node: TreeNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tree-node' + (node.partial ? ' partial' : '');
  const keyPart = node.key !== undefined ? `${node.key}: ` : '';
  const label = document.createElement('span');
  label.className = 'tree-label';

  if (node.children && node.children.length) {
    const toggle = document.createElement('button');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▾';
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    node.children.forEach((c) => childrenEl.appendChild(renderNode(c)));
    toggle.addEventListener('click', () => {
      const hidden = childrenEl.style.display === 'none';
      childrenEl.style.display = hidden ? '' : 'none';
      toggle.textContent = hidden ? '▾' : '▸';
    });
    label.textContent = `${keyPart}${typeLabel(node)}`;
    el.append(toggle, label, childrenEl);
  } else {
    label.textContent = `${keyPart}${node.value ?? typeLabel(node)}`;
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
