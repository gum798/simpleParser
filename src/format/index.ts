import type { Format, FormatResult } from '../types';
import { formatJson, formatJsonInPlace } from './json';
import { formatYaml } from './yaml';
import { formatXml } from './xml';
import { formatHtml } from './html';

export function format(text: string, fmt: Format): FormatResult {
  switch (fmt) {
    case 'json':
      return formatJson(text);
    case 'yaml':
      return formatYaml(text);
    case 'xml':
      return formatXml(text);
    case 'html':
      return formatHtml(text);
    case 'markdown':
      return { output: text, diagnostics: [] }; // v1: prettify 미지원
  }
}

/**
 * 원본 유지 정렬: json은 주변 텍스트를 지키는 제자리 정렬(데이터 손실 위험 결과는 보류),
 * 그 외 포맷은 추출 개념이 없어 통짜 정렬과 동일 — 단, 깨진 문서의 관용 재작성
 * (없는 태그 보정 등)은 내용을 바꿀 수 있으므로 본문은 두고 진단만 보여준다.
 */
export function formatKeepOriginal(text: string, fmt: Format): FormatResult {
  if (fmt === 'json') return formatJsonInPlace(text);
  const r = format(text, fmt);
  if (r.diagnostics.some((d) => d.severity === 'error')) return { diagnostics: r.diagnostics, faithful: false };
  return r;
}
