import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Format, State } from './types';

const FORMATS: readonly Format[] = ['json', 'html', 'xml', 'yaml', 'markdown'];

export function encode(state: State): string {
  return compressToEncodedURIComponent(JSON.stringify({ v: 1, f: state.f, d: state.d }));
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
      const o = obj as { f: Format; d: string };
      return { v: 1, f: o.f, d: o.d };
    }
    return null;
  } catch {
    return null;
  }
}
