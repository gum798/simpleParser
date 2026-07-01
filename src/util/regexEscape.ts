/** 문자열을 정규식에서 리터럴로 매칭되도록 특수문자를 이스케이프한다. */
export function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
