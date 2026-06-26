import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import type { Diagnostic, FormatResult } from '../types';
import { offsetToLineCol } from '../util/offsetToLineCol';

export function parseJsonTolerant(text: string): { value: unknown; diagnostics: Diagnostic[] } {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  const diagnostics: Diagnostic[] = errors.map((e) => {
    const { line, col } = offsetToLineCol(text, e.offset);
    return {
      message: printParseErrorCode(e.error),
      offset: e.offset,
      length: e.length,
      line,
      col,
      severity: 'error',
    };
  });
  return { value, diagnostics };
}

export function formatJson(text: string): FormatResult {
  // 1) 입력 전체가 유효한 JSON 문서면 그대로 정렬
  try {
    const value: unknown = JSON.parse(text);
    return { output: JSON.stringify(value, null, 2), diagnostics: [] };
  } catch {
    /* 단일 문서가 아님 → 추출/복구 시도 */
  }
  // 2) 로그/텍스트에 박힌 JSON 블록을 모두 추출해 각각 정렬(빈 줄로 구분)
  const blocks = extractJsonBlocks(text);
  if (blocks.length > 0) {
    const output = blocks.map((b) => JSON.stringify(JSON.parse(b), null, 2)).join('\n\n');
    return { output, diagnostics: [] };
  }
  // 3) 깨진 단일 문서(예: 콤마 빠진 JSON)는 관용 복구 + 진단
  const { value, diagnostics } = parseJsonTolerant(text);
  const output = value === undefined ? undefined : JSON.stringify(value, null, 2);
  return { output, diagnostics };
}

/**
 * 텍스트에서 유효한 JSON 객체/배열 블록을 모두 추출한다(O(n) 단일 패스).
 * 문자열·이스케이프를 인식하고, 균형은 맞지만 JSON이 아닌 구간은 내부를 다시 훑어
 * 중첩된 유효 JSON을 찾는다. (예: 로그의 `body={"a":1}` → `{"a":1}`)
 */
export function extractJsonBlocks(text: string, depth = 0): string[] {
  if (depth > 40) return []; // 병적 입력 방어(재귀 깊이 상한)
  const out: string[] = [];
  for (const [start, end] of topLevelSpans(text)) {
    const span = text.slice(start, end + 1);
    try {
      JSON.parse(span);
      out.push(span);
    } catch {
      // 균형은 맞지만 유효 JSON 아님 → 내부에서 중첩 JSON 탐색
      out.push(...extractJsonBlocks(text.slice(start + 1, end), depth + 1));
    }
  }
  return out;
}

/**
 * 문자열을 한 번만(O(n)) 훑어 최상위(깊이 0→0) 균형 괄호 구간 [start,end]들을 반환.
 * 문자열 리터럴 내부의 괄호는 무시하고, 괄호 종류가 어긋나면 해당 구간을 폐기한다.
 */
function topLevelSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const stack: string[] = []; // 기대하는 닫는 괄호들
  let topStart = -1;
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === '{' || c === '[') {
      if (stack.length === 0) topStart = i;
      stack.push(c === '{' ? '}' : ']');
    } else if (c === '}' || c === ']') {
      if (stack.length === 0) continue; // 짝 없는 닫기 → 무시
      if (stack[stack.length - 1] === c) {
        stack.pop();
        if (stack.length === 0 && topStart !== -1) {
          spans.push([topStart, i]);
          topStart = -1;
        }
      } else {
        // 괄호 종류 불일치 → 손상 구간, 초기화
        stack.length = 0;
        topStart = -1;
      }
    }
  }
  return spans;
}
