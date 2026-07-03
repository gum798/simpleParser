import safeRegex from 'safe-regex';

export interface HighlightRule {
  id: string;
  name: string;
  regex: string;
  enabled: boolean;
  textColor: string;
  bgColor: string;
}

export interface CompiledRule {
  rule: HighlightRule;
  re: RegExp | null; // null = 비활성/빈/무효 → 매칭 안 함
}

export interface HighlightSpan {
  from: number;
  to: number;
  rule: HighlightRule;
}

/** 규칙 색을 인라인 스타일로(색은 store에서 #rrggbb 검증됨 — 주입 방어). */
export function markStyle(rule: { textColor: string; bgColor: string }): string {
  return `color:${rule.textColor};background-color:${rule.bgColor}`;
}

export function isValidRegex(pattern: string): boolean {
  if (pattern === '') return true; // 입력 중 빈 값은 무효로 보지 않음
  try {
    new RegExp(pattern, 'g');
    return true;
  } catch {
    return false;
  }
}

export function compileRules(rules: HighlightRule[]): CompiledRule[] {
  return rules.map((rule) => {
    // 파국적 백트래킹(ReDoS) 패턴은 매칭하지 않는다 — 공유 URL로 전달된 정규식이
    // 받는 사람 메인스레드를 멈추지 못하게 한다(색상 검증과 같은 방어 차원).
    if (!rule.enabled || rule.regex === '' || !safeRegex(rule.regex)) return { rule, re: null };
    try {
      return { rule, re: new RegExp(rule.regex, 'g') };
    } catch {
      return { rule, re: null };
    }
  });
}

export function findHighlights(text: string, compiled: CompiledRule[]): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  for (const { rule, re } of compiled) {
    if (!re) continue;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const from = m.index;
      const to = from + m[0].length;
      if (to > from) spans.push({ from, to, rule });
      if (re.lastIndex === m.index) re.lastIndex++; // zero-length 매칭 전진 보장
    }
  }
  return spans;
}
