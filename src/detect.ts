import { parseDocument } from 'yaml';
import type { Format } from './types';
import { extractJsonBlocks } from './format/json';

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

  // 로그/텍스트에 박힌 JSON: 실제 파싱되는 JSON 블록이 있고, 그 블록들이 내용의 과반(비공백 기준)을
  // 차지할 때만 json으로 본다. (산문 속 작은 {..}가 통째로 json으로 오인돼 주변 텍스트가 사라지는 것 방지)
  const blocks = extractJsonBlocks(t);
  if (blocks.length > 0) {
    const nonWs = (s: string): number => s.replace(/\s+/g, '').length;
    const blocksChars = blocks.reduce((sum, b) => sum + nonWs(b), 0);
    const totalChars = nonWs(t);
    if (totalChars > 0 && blocksChars / totalChars > 0.5) {
      return 'json'; // 동률(정확히 절반)은 안전하게 markdown 유지
    }
  }

  return 'markdown';
}

function isWellFormedXml(t: string): boolean {
  const doc = new DOMParser().parseFromString(t, 'application/xml');
  return doc.getElementsByTagName('parsererror').length === 0;
}
