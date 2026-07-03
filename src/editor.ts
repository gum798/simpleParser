import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, lintGutter, forceLinting, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';
import { highlightExtension, setHighlightRules as applyHighlightRules } from './highlight/extension';
import type { Diagnostic, Format } from './types';
import type { HighlightRule } from './highlight/matcher';

const langFor: Record<Format, () => ReturnType<typeof json>> = {
  json,
  html,
  xml,
  yaml,
  markdown,
};

export function clampRange(from: number, to: number, len: number): { from: number; to: number } {
  const a = Math.max(0, Math.min(from, len));
  const b = Math.max(0, Math.min(to, len));
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

export function toCmDiagnostics(text: string, diags: Diagnostic[]): CmDiagnostic[] {
  // offset 없는 진단(예: XML)은 인라인 밑줄 위치를 알 수 없으므로 제외 — 상태줄 메시지로만 표시(스펙 §7)
  return diags
    .filter((d) => d.offset !== undefined)
    .map((d) => {
      const from = d.offset!;
      const to = Math.min(text.length, from + (d.length ?? 1));
      return { from, to: Math.max(from, to), severity: d.severity, message: d.message };
    });
}

export interface Editor {
  getValue(): string;
  getSelectionText(): string;
  scrollToTop(): void;
  setValue(s: string): void;
  setLanguage(fmt: Format): void;
  setDark(dark: boolean): void;
  setDiagnostics(d: Diagnostic[]): void;
  setHighlightRules(rules: HighlightRule[]): void;
  revealRange(from: number, to: number): void;
}

export function createEditor(
  parent: HTMLElement,
  initial: { text: string; fmt: Format; dark?: boolean },
  onChange: () => void,
): Editor {
  const language = new Compartment();
  const darkTheme = new Compartment(); // 다크 모드 토글 시 구문 색상 테마 교체
  let diagnostics: Diagnostic[] = [];

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initial.text,
      extensions: [
        basicSetup,
        language.of(langFor[initial.fmt]()),
        darkTheme.of(initial.dark ? oneDark : []),
        lintGutter(),
        highlightExtension,
        linter((v) => toCmDiagnostics(v.state.doc.toString(), diagnostics)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange();
        }),
      ],
    }),
  });

  return {
    getValue: () => view.state.doc.toString(),
    getSelectionText: () => {
      const { from, to } = view.state.selection.main;
      return view.state.sliceDoc(from, to);
    },
    // 커서를 문서 처음으로 옮기고 그 위치를 뷰에 노출 → 좌상단으로 스크롤(가로 스크롤도 리셋)
    scrollToTop: () => {
      view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
    },
    setValue: (s) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: s } }),
    setLanguage: (fmt) => view.dispatch({ effects: language.reconfigure(langFor[fmt]()) }),
    setDark: (dark) => view.dispatch({ effects: darkTheme.reconfigure(dark ? oneDark : []) }),
    setDiagnostics: (d) => {
      diagnostics = d;
      forceLinting(view);
    },
    setHighlightRules: (rules) => applyHighlightRules(view, rules),
    revealRange: (from, to) => {
      const { from: a, to: b } = clampRange(from, to, view.state.doc.length);
      view.dispatch({ selection: { anchor: a, head: b }, scrollIntoView: true });
      view.focus();
    },
  };
}
