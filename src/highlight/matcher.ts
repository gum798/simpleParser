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
    if (!rule.enabled || rule.regex === '') return { rule, re: null };
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
