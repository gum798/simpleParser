import type { HighlightRule } from './highlight/matcher';

export type Format = 'json' | 'html' | 'xml' | 'yaml' | 'markdown';

export interface Diagnostic {
  message: string;
  line?: number;
  col?: number;
  offset?: number;
  length?: number;
  severity: 'error' | 'warning';
}

export interface FormatResult {
  output?: string;
  diagnostics: Diagnostic[];
}

export interface TreeNode {
  key?: string;
  value?: string;
  type: 'object' | 'array' | 'element' | 'scalar';
  children?: TreeNode[];
  partial?: boolean;
  pos?: { from: number; to: number };
}

export interface TreeResult {
  root?: TreeNode;
  diagnostics: Diagnostic[];
}

export interface PreviewResult {
  html: string;
  diagnostics: Diagnostic[];
}

export interface State {
  v: 1;
  f: Format;
  d: string;
  r?: HighlightRule[]; // 하이라이트 규칙(옵션) — 없으면 localStorage 기본값으로 폴백
  p?: boolean; // 트리/미리보기 패널 열림 여부
  h?: boolean; // 하이라이트 규칙 패널 열림 여부
}
