import { parse, parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';
import type { Diagnostic, FormatResult } from '../types';
import { offsetToLineCol } from '../util/offsetToLineCol';

/**
 * 어떤 객체든 같은 키가 두 번 나오면 true.
 * JSON.parse는 중복 키를 조용히 마지막 값만 남기므로(데이터 손실), 자동 정렬 보류 판단에 쓴다.
 */
export function hasDuplicateKeys(text: string): boolean {
  const root = parseTree(text);
  if (!root) return false;
  let found = false;
  const walk = (node: Node): void => {
    if (found) return;
    if (node.type === 'object' && node.children) {
      const seen = new Set<string>();
      for (const prop of node.children) {
        const key = prop.children?.[0]?.value;
        if (typeof key === 'string') {
          if (seen.has(key)) {
            found = true;
            return;
          }
          seen.add(key);
        }
      }
    }
    if (node.children) for (const c of node.children) walk(c);
  };
  walk(root);
  return found;
}

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
  | { kind: 'repaired'; value: unknown; removedNewlines: number } // 문자열 안 랩 줄바꿈 제거로 복구된 단일 JSON
  | { kind: 'blocks'; values: unknown[]; completedBlocks?: number; trimmedChars?: number } // 추출 블록들(보충 복구 수·버린 꼬리 수 포함)
  | { kind: 'tolerant'; value: unknown; diagnostics: Diagnostic[] }; // 깨진 단일 문서의 관용 복구

/**
 * 입력을 JSON으로 해석한다(formatJson 전용).
 * 주의: buildTree(tree.ts)는 노드 위치(pos) 캡처를 위해 parseTree 기반으로 같은 라우팅
 * (validWhole / isWholeSingleSpan / 랩 줄바꿈 복구)을 별도로 재현한다 — 한쪽 휴리스틱을 바꾸면 다른 쪽도 맞출 것.
 * 1) 전체가 유효 JSON → value
 * 2) 문자열 안 랩 줄바꿈만 제거하면 유효해지는 경우 → repaired
 * 3) 주변 텍스트가 있는 경우(로그 등)만 박힌 블록 추출 → blocks
 * 4) 그 외(전체가 하나의 깨진 괄호 구조 등) → 관용 복구 + 진단
 */
export function resolveJson(text: string): JsonResolution {
  try {
    return { kind: 'value', value: JSON.parse(text) };
  } catch {
    /* 단일 문서가 아님 → 복구/추출 판단 */
  }
  const rep = repairJsonStringNewlines(text);
  if (rep.removed.length > 0) {
    try {
      return { kind: 'repaired', value: JSON.parse(rep.text), removedNewlines: rep.removed.length };
    } catch {
      /* 랩 복구로도 안 됨 → 추출/관용 복구로 */
    }
  }
  const { spans, recoverFrom, mismatched } = scanTopLevel(text, 0);
  // 전체가 (주변 공백 외엔) 하나의 괄호 구조면 '깨진 단일 문서'로 보고 추출하지 않는다.
  // (예: `{"a":1 "b":[2,3]}` 의 내부 `[2,3]`만 뽑아 a와 진단을 버리는 일 방지)
  const isWholeSingleSpan =
    spans.length === 1 &&
    text.slice(0, spans[0][0]).trim() === '' &&
    text.slice(spans[0][1] + 1).trim() === '';
  const isTruncatedWholeDoc =
    spans.length === 0 && recoverFrom !== null && text.slice(0, recoverFrom).trim() === '';
  if (!isWholeSingleSpan && !isTruncatedWholeDoc) {
    const blockSpans = extractJsonSpans(text);
    // 보충 스팬'만' 있는 경우는 문서에 다른 JSON 구조 흔적(균형 스팬·괄호 불일치)이
    // 전혀 없을 때만 채택 — 깨진 통짜 문서의 관용 전체 복구를 조각이 밀어내지 않게.
    const hasReal = blockSpans.some((b) => !b.appended);
    const salvageOnlyOk = spans.length === 0 && !mismatched;
    if (blockSpans.length > 0 && (hasReal || salvageOnlyOk)) {
      return {
        kind: 'blocks',
        values: blockSpans.map((b) => JSON.parse(b.text) as unknown),
        completedBlocks: blockSpans.filter((b) => b.appended).length,
        trimmedChars: blockSpans.reduce((n, b) => n + (b.trimmed ?? 0), 0),
      };
    }
  }
  const { value, diagnostics } = parseJsonTolerant(text);
  return { kind: 'tolerant', value, diagnostics };
}

export function formatJson(text: string): FormatResult {
  const r = resolveJson(text);
  if (r.kind === 'value') {
    // 전체가 깨끗한 단일 JSON → 유니코드/숫자 정규화는 값이 동일하므로 충실.
    // 단 중복 키는 JSON.parse가 마지막 값만 남겨 데이터가 사라지므로 자동 정렬 보류(faithful=false).
    return { output: JSON.stringify(r.value, null, 2), diagnostics: [], faithful: !hasDuplicateKeys(text) };
  }
  if (r.kind === 'repaired') {
    // 문자열 내용을 고친 복구 → 자동 정렬 보류 + 경고로 알림
    return {
      output: JSON.stringify(r.value, null, 2),
      diagnostics: [
        {
          message: `문자열 안의 줄바꿈 ${r.removedNewlines}개를 제거해 복구했습니다(터미널 랩 복사 추정)`,
          severity: 'warning',
        },
      ],
      faithful: false,
    };
  }
  if (r.kind === 'blocks') {
    // 로그 등에서 추출 → 주변 텍스트를 버리므로 자동 정렬엔 부적합(수동 [정렬] 전용)
    const trimmedNote = r.trimmedChars
      ? ` — 파싱 불가한 꼬리 ${r.trimmedChars}자는 버렸습니다(마지막 값이 잘렸을 수 있음)`
      : '';
    const diagnostics: Diagnostic[] = r.completedBlocks
      ? [
          {
            message: `잘린 JSON 블록 ${r.completedBlocks}개의 닫는 괄호를 보충해 복구했습니다(로거 절단 추정)${trimmedNote}`,
            severity: 'warning',
          },
        ]
      : [];
    return {
      output: r.values.map((v) => JSON.stringify(v, null, 2)).join('\n\n'),
      diagnostics,
      faithful: false,
    };
  }
  const output = r.value === undefined ? undefined : JSON.stringify(r.value, null, 2);
  return { output, diagnostics: r.diagnostics, faithful: false }; // 관용 복구(주석 제거 등) → 자동 보류
}

/**
 * 제자리 정렬(원본 유지 모드): 주변 텍스트(로그 접두어 등)는 한 글자도 지우지 않고,
 * 박힌 JSON 블록만 그 자리에서 2칸 들여쓰기로 펼친다. 랩 줄바꿈이 낀 블록은 복구해 펼친다.
 * 전체가 단일 JSON(주변 텍스트 없음)이거나 블록이 없으면 기존 formatJson과 동일하게 동작.
 */
export function formatJsonInPlace(text: string): FormatResult {
  const r = resolveJson(text);
  // 원본 유지 약속: 출력이 있으면 데이터 무손실이 보장된다.
  // JSON.parse→stringify 왕복은 중복 키 병합·큰 정수 절삭·1.0→1·이스케이프 정규화로
  // 값을 바꾸므로 쓰지 않고, 토큰을 그대로 보존하는 프린터로 공백만 다시 깐다.
  if (r.kind === 'value') {
    return { output: prettyPrintJsonTokens(text), diagnostics: [], faithful: false };
  }
  if (r.kind === 'repaired') {
    const rep = repairJsonStringNewlines(text);
    return {
      output: prettyPrintJsonTokens(rep.text),
      diagnostics: [wrapRepairWarning(rep.removed.length)],
      faithful: false,
    };
  }
  if (r.kind === 'tolerant') {
    // 관용 복구는 주석·후행 콤마 제거 등 내용을 잃을 수 있으므로 본문은 두고 보류 사유만 알린다.
    // (JSONC로는 유효해 파서 진단이 0건인 입력도 침묵하지 않도록 경고를 합성)
    const diagnostics: Diagnostic[] = r.diagnostics.length
      ? r.diagnostics
      : [{ message: '주석/후행 콤마가 있어 정렬을 보류했습니다(제거 시 내용 손실)', severity: 'warning' }];
    return { diagnostics, faithful: false };
  }
  // blocks: 스팬은 서로 겹치지 않는 오름차순 — 원본 길이 = 복구본 길이 + 제거된 줄바꿈 수
  const spans = extractJsonSpans(text);
  let out = '';
  let pos = 0;
  let removedNewlines = 0;
  let keptTruncated = 0;
  for (const s of spans) {
    if (s.appended) {
      keptTruncated++; // 보충 복구 블록은 원문 유지 — 닫는 괄호를 지어내 넣지 않는다
      continue;
    }
    const origLen = s.origLen ?? s.text.length + (s.removed?.length ?? 0);
    out += text.slice(pos, s.start);
    out += prettyPrintJsonTokens(s.text);
    pos = s.start + origLen;
    removedNewlines += s.removed?.length ?? 0;
  }
  out += text.slice(pos);
  const diagnostics: Diagnostic[] = [];
  if (removedNewlines > 0) diagnostics.push(wrapRepairWarning(removedNewlines));
  if (keptTruncated > 0)
    diagnostics.push({
      message: `잘린 JSON 블록 ${keptTruncated}개는 원문 그대로 두었습니다(로거 절단 추정)`,
      severity: 'warning',
    });
  return { output: out, diagnostics, faithful: false }; // 블록 내부 공백 변경 → 자동 정렬 보류
}

function wrapRepairWarning(count: number): Diagnostic {
  return {
    message: `문자열 안의 줄바꿈 ${count}개를 제거해 복구했습니다(터미널 랩 복사 추정)`,
    severity: 'warning',
  };
}

/**
 * 유효한 JSON 텍스트를 2칸 들여쓰기로 다시 깐다 — 문자열·숫자·리터럴 토큰은 바이트
 * 그대로 보존한다(JSON.stringify와 달리 중복 키·큰 정수·1.0·유니코드 이스케이프 무변형).
 * 구조 밖 공백만 버리고 새로 배치하므로 출력은 항상 입력과 값이 동일하다.
 */
export function prettyPrintJsonTokens(src: string): string {
  let out = '';
  let depth = 0;
  let inStr = false;
  let escaped = false;
  const indent = (): string => '  '.repeat(depth);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      continue; // 구조 밖 공백은 버리고 새로 깐다
    } else if (c === '{' || c === '[') {
      let j = i + 1; // 빈 객체/배열은 {}·[]로 붙여 쓴다(JSON.stringify와 동일)
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === (c === '{' ? '}' : ']')) {
        out += c + src[j];
        i = j;
      } else {
        out += c;
        depth++;
        out += '\n' + indent();
      }
    } else if (c === '}' || c === ']') {
      depth--;
      out += '\n' + indent() + c;
    } else if (c === ',') {
      out += ',\n' + indent();
    } else if (c === ':') {
      out += ': ';
    } else {
      out += c; // 숫자·true/false/null 리터럴은 그대로
    }
  }
  return out;
}

/**
 * 문자열 리터럴 '안'의 raw 줄바꿈(\r, \n)을 제거한다. 터미널 폭에서 랩된 로그를 복사하면
 * 문자열 중간에 실제 줄바꿈이 끼는데, JSON 스펙상 제어문자는 불법이라 파싱이 통째로 깨진다.
 * 랩 줄바꿈은 표시용으로 삽입된 문자이므로 '제거'가 원문 복원이다(공백 치환은 ID·키를 오염시킴).
 * removed: 제거한 문자들의 원본 오프셋(오름차순) — 트리 pos를 원본 좌표로 되돌릴 때 사용.
 */
export function repairJsonStringNewlines(text: string): { text: string; removed: number[] } {
  const removed: number[] = [];
  let out = '';
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr && (c === '\n' || c === '\r')) {
      removed.push(i); // 이스케이프 중간에 낀 랩(`\` 뒤 줄바꿈)도 있으므로 escaped 상태는 건드리지 않는다
      continue;
    }
    out += c;
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    }
  }
  return { text: out, removed };
}

/** 복구 텍스트의 오프셋 → 원본 오프셋(removed는 repairJsonStringNewlines의 오름차순 원본 오프셋). */
export function mapRepairedOffset(removed: number[], off: number): number {
  let k = 0;
  while (k < removed.length && removed[k] <= off + k) k++;
  return off + k;
}

function parsesAsJson(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * 잘린(닫히지 않은) JSON 조각을 유효하게 보충한다: 꼬리의 불완전 토큰(`,`·`"key":`·
 * 반쪽 이스케이프 등)을 최소한으로 다듬고, 열린 문자열을 닫고, 스택에 남은 닫는 괄호를
 * 붙인다. 로거가 길이 제한으로 자른 응답 본문을 '있는 데까지' 살리기 위한 것.
 * 빈 껍데기({}·[])만 남으면 노이즈라 null.
 */
export function completeTruncatedJson(
  region: string,
): { text: string; appended: number; trimmed: number } | null {
  // 트리밍 상한: 보통의 `,"key":`·후행 콤마·반쪽 이스케이프면 충분. 이보다 크게 잘라야
  // 한다는 건 블록 앞쪽이 손상됐다는 뜻 — 조용히 내용을 버리느니 관용 복구에 양보한다.
  const MAX_TRIM = 32;
  // O(1) 사전 게이트: JSON일 수 없는 시작(파이썬 dict repr, JS 객체 toString 등)은
  // 파싱 시도 없이 제외 — 잘린 비JSON 라인이 많은 로그에서의 성능 회귀 방지.
  let j = 1;
  while (j < region.length && /\s/.test(region[j])) j++;
  const second = region[j] ?? '';
  if (region[0] === '{' && second !== '"' && second !== '}') return null;
  if (region[0] === '[' && !/["{[\d\-tfn]/.test(second)) return null;
  const cp = Math.max(0, region.length - MAX_TRIM);
  const stack: string[] = [];
  let inStr = false;
  let escaped = false;
  const step = (c: string): void => {
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      return;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (stack[stack.length - 1] === c) stack.pop();
      else stack.length = 0; // 괄호 불일치 → 보충 불가 신호(closers가 비게 됨)
    }
  };
  let i = 0;
  for (; i < cp; i++) step(region[i]);
  // 체크포인트 이후 꼬리 위치별 상태를 기록해 두고, 뒤에서부터 자를 지점을 찾는다
  const states: Array<{ closers: string; inStr: boolean; escaped: boolean }> = [
    { closers: stack.slice().reverse().join(''), inStr, escaped },
  ];
  for (; i < region.length; i++) {
    step(region[i]);
    states.push({ closers: stack.slice().reverse().join(''), inStr, escaped });
  }
  for (let trim = 0; trim < states.length; trim++) {
    const st = states[states.length - 1 - trim];
    if (st.escaped || st.closers.length === 0) continue;
    const cut = region.length - trim;
    const cand = region.slice(0, cut) + (st.inStr ? '"' : '') + st.closers;
    if (!parsesAsJson(cand)) {
      if (trim === 0) {
        // 트리밍 가능 구간(cp) 앞쪽의 손상은 어떤 trim으로도 못 고친다 → 즉시 포기(성능 가드)
        const errs: ParseError[] = [];
        parse(cand, errs);
        if (errs.length > 0 && errs[0].offset < cp) return null;
      }
      continue;
    }
    const v = JSON.parse(cand) as unknown;
    const nonEmpty = Array.isArray(v)
      ? v.length > 0
      : v !== null && typeof v === 'object' && Object.keys(v as object).length > 0;
    if (!nonEmpty) return null;
    return { text: cand, appended: cand.length - cut, trimmed: trim };
  }
  return null;
}

/**
 * 텍스트에서 유효한 JSON 객체/배열 블록을 모두 추출한다(O(n) 단일 패스).
 * 문자열·이스케이프를 인식하고, 균형은 맞지만 JSON이 아닌 구간은 먼저 랩 줄바꿈 복구를
 * 시도한 뒤, 그래도 안 되면 내부를 다시 훑어 중첩된 유효 JSON을 찾는다.
 * (예: 로그의 `body={"a":1}` → `{"a":1}`)
 */
/** 블록 텍스트와 그 절대 시작 오프셋을 함께 추출한다(중첩 복구 시 base로 절대 위치 유지).
 *  removed가 있으면 text는 복구본이고, removed는 블록 시작 기준 상대 오프셋이다. */
export interface JsonSpan {
  text: string; // 스팬의 (필요시 복구/보충된) JSON 텍스트
  start: number; // 원본 절대 시작 오프셋
  removed?: number[]; // 랩 줄바꿈 복구 시 제거한 스팬 상대 오프셋들
  origLen?: number; // 원본 구간 길이(보충 복구 스팬용 — text 길이와 다름)
  appended?: number; // 잘린 블록 보충 시 덧붙인 문자 수(> 0이면 보충 복구 스팬)
  trimmed?: number; // 보충 과정에서 버린 꼬리 문자 수(경고 문구에 사실대로 표기)
}

export function extractJsonSpans(text: string, base = 0, depth = 0): JsonSpan[] {
  if (depth > 40) return [];
  const out: JsonSpan[] = [];
  let from = 0;
  for (;;) {
    const { spans, recoverFrom } = scanTopLevel(text, from);
    for (const [s, e] of spans) {
      const span = text.slice(s, e + 1);
      if (parsesAsJson(span)) {
        out.push({ text: span, start: base + s });
        continue;
      }
      const rep = repairJsonStringNewlines(span);
      if (rep.removed.length > 0 && parsesAsJson(rep.text)) {
        out.push({ text: rep.text, start: base + s, removed: rep.removed });
      } else {
        out.push(...extractJsonSpans(text.slice(s + 1, e), base + s + 1, depth + 1));
      }
    }
    if (recoverFrom === null) break;
    // 로거가 잘라버린(끝까지 닫히지 않는) 블록/문자열: 그 줄만 건너뛰고 다음 줄부터
    // 새 상태로 재탐색 — 잘린 한 줄이 이후 문서 전체를 삼키지 않게 한다(from은 단조 증가 → 종료 보장).
    const nl = text.indexOf('\n', recoverFrom);
    const regionEnd = nl === -1 ? text.length : nl;
    // 잘린 블록 자체도 살린다: 닫는 괄호를 보충해 유효해지면 '보충 복구' 스팬으로 추가.
    // (원본 유지 정렬은 appended 표시를 보고 이 블록을 건너뛴다 — 괄호를 지어내지 않기 위해)
    if (text[recoverFrom] === '{' || text[recoverFrom] === '[') {
      const done = completeTruncatedJson(text.slice(recoverFrom, regionEnd));
      if (done) {
        out.push({
          text: done.text,
          start: base + recoverFrom,
          origLen: regionEnd - recoverFrom,
          appended: done.appended,
          trimmed: done.trimmed,
        });
      }
    }
    if (nl === -1) break;
    from = nl + 1;
  }
  return out;
}

export function extractJsonBlocks(text: string): string[] {
  return extractJsonSpans(text).map((b) => b.text);
}

/**
 * 문자열을 한 번만(O(n)) 훑어 최상위(깊이 0→0) 균형 괄호 구간 [start,end]들을 반환.
 * 문자열 리터럴 내부의 괄호는 무시하고, 괄호 종류가 어긋나면 해당 구간을 폐기한다.
 */
export function topLevelSpans(text: string): Array<[number, number]> {
  return scanTopLevel(text, 0).spans;
}

/**
 * topLevelSpans의 내부 구현 + 복구 지점 보고. recoverFrom은 문서 끝까지 닫히지 않은
 * 최상위 블록(로거가 자른 거대 JSON 등) 또는 열린 문자열의 시작 오프셋 — 호출자는 그
 * 줄을 건너뛰고 재탐색해 이후 블록을 살릴 수 있다. 문자열의 줄바꿈은 깊이와 무관하게
 * 허용한다(터미널 랩 복사로 인용문이 줄을 넘는 경우가 실제로 있음 — 줄끝 리셋은
 * 그 뒤 블록을 삼키는 회귀를 만들어 리뷰에서 제거됨).
 */
export function scanTopLevel(
  text: string,
  from: number,
): { spans: Array<[number, number]>; recoverFrom: number | null; mismatched: boolean } {
  const spans: Array<[number, number]> = [];
  const stack: string[] = []; // 기대하는 닫는 괄호들
  let topStart = -1;
  let inStr = false;
  let escaped = false;
  let strStart = -1;
  let mismatched = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      strStart = i;
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
        mismatched = true;
      }
    }
  }
  // 문서 끝까지 닫히지 않은 구조가 남았으면 그 시작점을 보고(잘린 로그 라인 복구용)
  let recoverFrom: number | null = null;
  if (stack.length > 0 && topStart !== -1) recoverFrom = topStart;
  else if (inStr) recoverFrom = strStart;
  return { spans, recoverFrom, mismatched };
}
