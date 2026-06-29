import type { TreeNode } from './types';

/** XML/HTML 노드의 소스 위치를 텍스트 검색으로 근사한다(정확 오프셋이 없을 때). */
export function approxFind(text: string, node: TreeNode): { from: number; to: number } | null {
  const token = searchToken(node);
  if (token === null) return null;
  const idx = text.indexOf(token);
  if (idx === -1) return null;
  // 속성/태그는 접두 기호를 제외한 이름 부분만 선택
  if (node.type === 'element') return { from: idx + 1, to: idx + token.length }; // '<' 제외
  if (node.key && node.key.startsWith('@')) return { from: idx, to: idx + token.length - 1 }; // '=' 제외
  return { from: idx, to: idx + token.length };
}

function searchToken(node: TreeNode): string | null {
  if (node.type === 'element') return `<${node.key ?? ''}`;
  if (node.key && node.key.startsWith('@')) return `${node.key.slice(1)}=`;
  if (node.type === 'scalar' && node.value) return node.value;
  return null; // object/array 등은 검색 토큰 없음
}
