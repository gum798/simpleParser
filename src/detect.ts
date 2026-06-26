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

  // YAML: 맵/시퀀스로 파싱되고 에러가 없을 때만 (평문 한 줄은 제외)
  try {
    const doc = parseDocument(t);
    const contents = doc.contents as { items?: unknown[] } | null;
    if (doc.errors.length === 0 && contents && Array.isArray(contents.items) && contents.items.length > 0) {
      return 'yaml';
    }
  } catch {
    /* YAML 아님 */
  }

  return 'markdown';
}

function isWellFormedXml(t: string): boolean {
  const doc = new DOMParser().parseFromString(t, 'application/xml');
  return doc.getElementsByTagName('parsererror').length === 0;
}
