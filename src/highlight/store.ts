import type { HighlightRule } from './matcher';

const KEY = 'simpleparser.highlightRules';

function isRule(x: unknown): x is HighlightRule {
  const r = x as Record<string, unknown>;
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.regex === 'string' &&
    typeof r.enabled === 'boolean' &&
    typeof r.textColor === 'string' &&
    typeof r.bgColor === 'string'
  );
}

export function loadRules(): HighlightRule[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRule) : [];
  } catch {
    return [];
  }
}

export function saveRules(rules: HighlightRule[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rules));
  } catch {
    /* 프라이빗 모드 등 접근 실패 → 무시(메모리에서만 동작) */
  }
}
