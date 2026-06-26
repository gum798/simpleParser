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
  const trimmed = text.trim();
  // 단일 JSON 문서({ 또는 [ 로 시작): 엄격 파싱 → 실패 시 관용 복구(기존 동작)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const value: unknown = JSON.parse(text);
      return { output: JSON.stringify(value, null, 2), diagnostics: [] };
    } catch {
      /* 관용 파싱으로 폴백 */
    }
    const { value, diagnostics } = parseJsonTolerant(text);
    const output = value === undefined ? undefined : JSON.stringify(value, null, 2);
    return { output, diagnostics };
  }

  // 로그/텍스트 모드: 박힌 JSON 블록을 모두 추출해 각각 정렬(빈 줄로 구분)
  const blocks = extractJsonBlocks(text);
  if (blocks.length === 0) {
    return {
      output: undefined,
      diagnostics: [{ message: '텍스트에서 JSON을 찾지 못했습니다', severity: 'error' }],
    };
  }
  const output = blocks.map((b) => JSON.stringify(JSON.parse(b), null, 2)).join('\n\n');
  return { output, diagnostics: [] };
}

/**
 * 텍스트에서 균형 잡힌 JSON 객체/배열 블록을 순서대로 모두 추출한다.
 * 문자열 리터럴과 이스케이프를 인식하며, 실제 `JSON.parse`에 성공하는 블록만 반환한다.
 * (예: 로그 줄의 `body={"a":1}` 에서 `{"a":1}` 를 뽑아냄)
 */
export function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      const end = matchBalanced(text, i);
      if (end !== -1) {
        const candidate = text.slice(i, end + 1);
        try {
          JSON.parse(candidate);
          blocks.push(candidate);
        } catch {
          /* 균형은 맞지만 유효한 JSON이 아님 — 건너뜀 */
        }
        i = end + 1;
        continue;
      }
    }
    i++;
  }
  return blocks;
}

/** start 위치의 여는 괄호와 짝이 맞는 닫는 괄호의 인덱스를 반환(없으면 -1). 문자열 내부는 무시. */
function matchBalanced(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
