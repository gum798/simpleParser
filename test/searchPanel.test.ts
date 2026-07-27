// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState, EditorSelection } from '@codemirror/state';
import { SearchQuery } from '@codemirror/search';
import { normalizeSearchInput, countMatches } from '../src/searchPanel';

describe('normalizeSearchInput', () => {
  it('붙여넣은 실제 줄바꿈을 \\n 이스케이프로 변환한다', () => {
    expect(normalizeSearchInput('"target": {\n  "a"')).toBe('"target": {\\n  "a"');
    expect(normalizeSearchInput('a\r\nb')).toBe('a\\nb');
    expect(normalizeSearchInput('a\rb')).toBe('a\\nb');
    expect(normalizeSearchInput('a\tb')).toBe('a\\tb');
  });

  it('일반 문자열은 그대로 둔다', () => {
    expect(normalizeSearchInput('"target"')).toBe('"target"');
  });
});

describe('countMatches', () => {
  function makeView(doc: string, anchor = 0, head = 0): EditorView {
    return new EditorView({
      state: EditorState.create({ doc, selection: EditorSelection.single(anchor, head) }),
    });
  }

  it('전체 매치 수를 센다', () => {
    const view = makeView('foo bar foo baz foo');
    const q = new SearchQuery({ search: 'foo' });
    expect(countMatches(view, q)).toEqual({ current: 0, total: 3, capped: false });
  });

  it('선택이 매치와 일치하면 현재 위치를 알려준다', () => {
    const view = makeView('foo bar foo baz foo', 8, 11);
    const q = new SearchQuery({ search: 'foo' });
    expect(countMatches(view, q)).toEqual({ current: 2, total: 3, capped: false });
  });

  it('줄바꿈이 포함된 검색어(\\n 해석)도 매치한다', () => {
    const view = makeView('"target": {\n  "a": 1\n}');
    const q = new SearchQuery({ search: '{\\n  "a"' });
    expect(countMatches(view, q).total).toBe(1);
  });
});
