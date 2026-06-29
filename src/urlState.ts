import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Format, State } from './types';
import { sanitizeRules } from './highlight/store';

const FORMATS: readonly Format[] = ['json', 'html', 'xml', 'yaml', 'markdown'];

export function encode(state: State): string {
  // 기본값(빈 규칙/닫힌 패널)은 생략해 링크를 짧게 유지. 불리언은 1로 저장(압축 효율).
  const obj: Record<string, unknown> = { v: 1, f: state.f, d: state.d };
  if (state.r && state.r.length > 0) obj.r = state.r;
  if (state.p) obj.p = 1;
  if (state.h) obj.h = 1;
  return compressToEncodedURIComponent(JSON.stringify(obj));
}

export function decode(hash: string): State | null {
  const token = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!token) return null;
  try {
    const json = decompressFromEncodedURIComponent(token);
    if (!json) return null;
    const obj: unknown = JSON.parse(json);
    if (
      typeof obj === 'object' &&
      obj !== null &&
      (obj as { v?: unknown }).v === 1 &&
      FORMATS.includes((obj as { f?: Format }).f as Format) &&
      typeof (obj as { d?: unknown }).d === 'string'
    ) {
      const o = obj as { f: Format; d: string; r?: unknown; p?: unknown; h?: unknown };
      const state: State = { v: 1, f: o.f, d: o.d };
      // 선택 필드는 있을 때만 채운다(없으면 기존 v:1 링크와 동일). 규칙은 유효성 검증 후 수용.
      const rules = sanitizeRules(o.r);
      if (rules.length > 0) state.r = rules;
      if (o.p === 1 || o.p === true) state.p = true;
      if (o.h === 1 || o.h === true) state.h = true;
      return state;
    }
    return null;
  } catch {
    return null;
  }
}
