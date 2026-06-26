import { parseDocument, type YAMLError } from 'yaml';
import type { Diagnostic, FormatResult } from '../types';

function toDiagnostic(severity: 'error' | 'warning') {
  return (e: YAMLError): Diagnostic => {
    const pos = e.linePos?.[0];
    return {
      message: e.message,
      line: pos?.line,
      col: pos?.col,
      offset: e.pos?.[0],
      severity,
    };
  };
}

export function parseYamlTolerant(text: string): { value: unknown; diagnostics: Diagnostic[] } {
  const doc = parseDocument(text, { prettyErrors: true });
  const diagnostics: Diagnostic[] = [
    ...doc.errors.map(toDiagnostic('error')),
    ...doc.warnings.map(toDiagnostic('warning')),
  ];
  let value: unknown;
  try {
    value = doc.toJS();
  } catch {
    value = undefined;
  }
  return { value, diagnostics };
}

export function formatYaml(text: string): FormatResult {
  const doc = parseDocument(text, { prettyErrors: true });
  const diagnostics: Diagnostic[] = [
    ...doc.errors.map(toDiagnostic('error')),
    ...doc.warnings.map(toDiagnostic('warning')),
  ];
  let output: string | undefined;
  try {
    output = doc.contents != null ? String(doc) : undefined;
  } catch {
    output = undefined;
  }
  return { output, diagnostics };
}
