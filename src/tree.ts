import type { Diagnostic, Format, TreeNode, TreeResult } from './types';
import { parseJsonTolerant, extractJsonBlocks } from './format/json';
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
  // 1) 입력 전체가 유효한 JSON 문서면 그대로 트리화
  try {
    const value: unknown = JSON.parse(text);
    return { root: valueToNode(value), diagnostics: [] };
  } catch {
    /* 단일 문서가 아님 → 추출/복구 시도 */
  }
  // 2) 로그/텍스트: 박힌 JSON 블록을 추출해 트리로 구성(여러 개면 배열로 묶음)
  const blocks = extractJsonBlocks(text);
  if (blocks.length > 0) {
    const values = blocks.map((b) => JSON.parse(b) as unknown);
    const root = values.length === 1 ? valueToNode(values[0]) : valueToNode(values);
    return { root, diagnostics: [] };
  }
  // 3) 깨진 단일 문서는 관용 복구(partial 표시 + 진단)
  return fromValue(parseJsonTolerant(text));
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
