import type { HighlightRule } from './matcher';

const KEY = 'simpleparser.highlightRules';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isRule(x: unknown): x is HighlightRule {
  const r = x as Record<string, unknown>;
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.regex === 'string' &&
    typeof r.enabled === 'boolean' &&
    // 색상은 #rrggbb만 허용 — 손으로 고친 localStorage 값이 style 속성에 임의 CSS를 주입하는 것 방지(방어적)
    typeof r.textColor === 'string' &&
    HEX_COLOR.test(r.textColor) &&
    typeof r.bgColor === 'string' &&
    HEX_COLOR.test(r.bgColor)
  );
}

/** 임의 입력(localStorage/URL)에서 유효한 규칙만 추려낸다 — 색상 주입 등 방어. */
export function sanitizeRules(value: unknown): HighlightRule[] {
  return Array.isArray(value) ? value.filter(isRule) : [];
}

export function loadRules(): HighlightRule[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return sanitizeRules(parsed);
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
