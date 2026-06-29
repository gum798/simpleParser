import { StateField, StateEffect, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { compileRules, findHighlights, type CompiledRule, type HighlightRule } from './matcher';

export function markStyle(rule: { textColor: string; bgColor: string }): string {
  return `color:${rule.textColor};background-color:${rule.bgColor}`;
}

const setRulesEffect = StateEffect.define<CompiledRule[]>();

const rulesField = StateField.define<CompiledRule[]>({
  create() {
    return [];
  },
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setRulesEffect)) return e.value;
    return value;
  },
});

/** 테스트 보조: 현재 컴파일된 규칙 수 */
export function rulesFieldLength(view: EditorView): number {
  return view.state.field(rulesField).length;
}

const highlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      const rulesChanged = u.startState.field(rulesField) !== u.state.field(rulesField);
      if (u.docChanged || u.viewportChanged || rulesChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function buildDecorations(view: EditorView): DecorationSet {
  const compiled = view.state.field(rulesField);
  if (!compiled.some((c) => c.re)) return Decoration.none;
  const decos = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    for (const span of findHighlights(text, compiled)) {
      decos.push(
        Decoration.mark({ attributes: { style: markStyle(span.rule) } }).range(from + span.from, from + span.to),
      );
    }
  }
  return Decoration.set(decos, true); // true = CodeMirror가 정렬
}

export const highlightExtension: Extension = [rulesField, highlightPlugin];

export function setHighlightRules(view: EditorView, rules: HighlightRule[]): void {
  view.dispatch({ effects: setRulesEffect.of(compileRules(rules)) });
}
