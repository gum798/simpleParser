import { parseDocument } from 'yaml';
import type { Format } from './types';

export function detectFormat(text: string): Format {
  const t = text.trim();
  if (t === '') return 'markdown';

  // JSON: 대괄호/중괄호로 시작하면 (유효하지 않아도) JSON으로 다룬다 — best-effort 포맷터가 처리.
  if (/^[[{]/.test(t)) return 'json';

  // XML / HTML
  if (t.startsWith('<')) {
    if (/^<\?xml/i.test(t)) return 'xml';
    if (/<!doctype\s+html/i.test(t) || /<(html|head|body|div|span|p|a|table|ul|ol|li|img|h[1-6])[\s>/]/i.test(t)) {
      return 'html';
    }
    return isWellFormedXml(t) ? 'xml' : 'html';
  }

  // YAML: 맵/시퀀스로 파싱되고 에러가 없을 때만.
  // 단, 한 줄짜리 단일 키(예: "Note: this matters")는 산문일 수 있어 제외 — 여러 항목이거나 여러 줄일 때만 YAML.
  try {
    const doc = parseDocument(t);
    const contents = doc.contents as { items?: unknown[] } | null;
    const items = contents?.items;
    if (doc.errors.length === 0 && Array.isArray(items) && items.length > 0 && (items.length >= 2 || /\n/.test(t))) {
      return 'yaml';
    }
  } catch {
    /* YAML 아님 */
  }

  // 로그/텍스트에 박힌 JSON(예: body={"runId":...}): 마크다운 마커가 없을 때만 json으로 본다.
  if (/[{[]\s*["[{]/.test(t) && !hasMarkdownMarkers(t)) {
    return 'json';
  }

  return 'markdown';
}

function hasMarkdownMarkers(t: string): boolean {
  return (
    /^#{1,6}\s/m.test(t) || // 제목
    /^\s*[-*+]\s/m.test(t) || // 목록
    /^\s*\d+\.\s/m.test(t) || // 번호 목록
    /^```/m.test(t) // 코드 펜스
  );
}

function isWellFormedXml(t: string): boolean {
  const doc = new DOMParser().parseFromString(t, 'application/xml');
  return doc.getElementsByTagName('parsererror').length === 0;
}
