import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { PreviewResult } from './types';

export function renderMarkdown(text: string): PreviewResult {
  const raw = marked.parse(text, { async: false }) as string;
  const html = DOMPurify.sanitize(raw);
  return { html, diagnostics: [] };
}
