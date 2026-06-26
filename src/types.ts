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
}
