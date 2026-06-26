import beautify from 'js-beautify';
import type { FormatResult } from '../types';

export function formatHtml(text: string): FormatResult {
  const output = beautify.html(text, {
    indent_size: 2,
    wrap_line_length: 0,
    preserve_newlines: true,
    end_with_newline: false,
  });
  return { output, diagnostics: [] };
}
