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

export type JsonResolution =
  | { kind: 'value'; value: unknown } // 전체가 유효한 단일 JSON
  | { kind: 'blocks'; values: unknown[] } // 텍스트에서 추출한 JSON 블록들
  | { kind: 'tolerant'; value: unknown; diagnostics: Diagnostic[] }; // 깨진 단일 문서의 관용 복구

/**
 * 입력을 JSON으로 해석한다. formatJson과 buildTree가 동일한 라우팅을 공유한다.
 * 1) 전체가 유효 JSON → value
 * 2) 주변 텍스트가 있는 경우(로그 등)만 박힌 블록 추출 → blocks
 * 3) 그 외(전체가 하나의 깨진 괄호 구조 등) → 관용 복구 + 진단
 */
export function resolveJson(text: string): JsonResolution {
  try {
    return { kind: 'value', value: JSON.parse(text) };
  } catch {
    /* 단일 문서가 아님 → 추출/복구 판단 */
  }
  const spans = topLevelSpans(text);
  // 전체가 (주변 공백 외엔) 하나의 괄호 구조면 '깨진 단일 문서'로 보고 추출하지 않는다.
  // (예: `{"a":1 "b":[2,3]}` 의 내부 `[2,3]`만 뽑아 a와 진단을 버리는 일 방지)
  const isWholeSingleSpan =
    spans.length === 1 &&
    text.slice(0, spans[0][0]).trim() === '' &&
    text.slice(spans[0][1] + 1).trim() === '';
  if (!isWholeSingleSpan) {
    const blocks = extractJsonBlocks(text);
    if (blocks.length > 0) {
      return { kind: 'blocks', values: blocks.map((b) => JSON.parse(b) as unknown) };
    }
  }
  const { value, diagnostics } = parseJsonTolerant(text);
  return { kind: 'tolerant', value, diagnostics };
}

export function formatJson(text: string): FormatResult {
  const r = resolveJson(text);
  if (r.kind === 'value') {
    return { output: JSON.stringify(r.value, null, 2), diagnostics: [] };
  }
  if (r.kind === 'blocks') {
    return { output: r.values.map((v) => JSON.stringify(v, null, 2)).join('\n\n'), diagnostics: [] };
  }
  const output = r.value === undefined ? undefined : JSON.stringify(r.value, null, 2);
  return { output, diagnostics: r.diagnostics };
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
