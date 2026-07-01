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
  // 정렬이 내용을 보존하는 '충실한' 재구성인지(자동 붙여넣기 정렬 적용 판단용).
  // false면 추출/복구처럼 내용이 바뀌는 정렬 → 자동 적용 보류. 미설정은 충실로 간주.
  faithful?: boolean;
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
