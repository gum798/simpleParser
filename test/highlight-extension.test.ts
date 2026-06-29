import { test, expect } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markStyle, highlightExtension, setHighlightRules, rulesFieldLength } from '../src/highlight/extension';
import type { HighlightRule } from '../src/highlight/matcher';

const rule: HighlightRule = { id: 'a', name: '', regex: 'hello', enabled: true, textColor: '#111111', bgColor: '#ffff00' };

test('markStyle은 color/background-color 인라인 스타일', () => {
  expect(markStyle(rule)).toBe('color:#111111;background-color:#ffff00');
});

test('setHighlightRules가 rulesField를 갱신', () => {
  const view = new EditorView({ state: EditorState.create({ doc: 'hello', extensions: [highlightExtension] }) });
  expect(rulesFieldLength(view)).toBe(0);
  setHighlightRules(view, [rule]);
  expect(rulesFieldLength(view)).toBe(1);
  view.destroy();
});
