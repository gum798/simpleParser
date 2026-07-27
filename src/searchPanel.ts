import { EditorView, runScopeHandlers, type Panel, type ViewUpdate } from '@codemirror/view';
import {
  SearchQuery,
  setSearchQuery,
  getSearchQuery,
  findNext,
  findPrevious,
  selectMatches,
  replaceNext,
  replaceAll,
  closeSearchPanel,
} from '@codemirror/search';

// 카운트 상한 — 초대형 문서에서 매치 전수 세기로 UI가 멈추지 않도록 함
const COUNT_LIMIT = 999;

// input에는 줄바꿈을 직접 입력할 수 없으므로, 붙여넣기로 들어온 실제 줄바꿈을
// \n 이스케이프로 바꿔 여러 줄 문자열 검색이 되게 한다(SearchQuery가 \n을 해석)
export function normalizeSearchInput(s: string): string {
  return s.replace(/\r\n|\r|\n/g, '\\n').replace(/\t/g, '\\t');
}

export function countMatches(
  view: EditorView,
  query: SearchQuery,
): { current: number; total: number; capped: boolean } {
  const sel = view.state.selection.main;
  let total = 0;
  let current = 0;
  const cursor = query.getCursor(view.state);
  for (let m = cursor.next(); !m.done; m = cursor.next()) {
    total++;
    if (m.value.from === sel.from && m.value.to === sel.to) current = total;
    if (total >= COUNT_LIMIT) return { current, total, capped: true };
  }
  return { current, total, capped: false };
}

export function createSearchPanel(view: EditorView): Panel {
  const query = getSearchQuery(view.state);

  const searchField = document.createElement('input');
  searchField.className = 'cm-textfield';
  searchField.placeholder = 'Find';
  searchField.name = 'search';
  searchField.setAttribute('main-field', 'true');
  searchField.value = query.search;

  const replaceField = document.createElement('input');
  replaceField.className = 'cm-textfield';
  replaceField.placeholder = 'Replace';
  replaceField.name = 'replace';
  replaceField.value = query.replace;

  const countEl = document.createElement('span');
  countEl.className = 'cm-search-count';

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'cm-button';
    b.textContent = label;
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function checkbox(label: string, checked: boolean): [HTMLLabelElement, HTMLInputElement] {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', commit);
    const l = document.createElement('label');
    l.append(cb, label);
    return [l, cb];
  }

  const [caseLabel, caseCb] = checkbox('match case', query.caseSensitive);
  const [reLabel, reCb] = checkbox('regexp', query.regexp);
  const [wordLabel, wordCb] = checkbox('by word', query.wholeWord);

  function currentQuery(): SearchQuery {
    return new SearchQuery({
      search: normalizeSearchInput(searchField.value),
      replace: replaceField.value,
      caseSensitive: caseCb.checked,
      regexp: reCb.checked,
      wholeWord: wordCb.checked,
    });
  }

  function commit() {
    const q = currentQuery();
    if (!q.eq(getSearchQuery(view.state))) {
      view.dispatch({ effects: setSearchQuery.of(q) });
      refreshCount(q);
    }
  }

  function refreshCount(q?: SearchQuery) {
    const query = q ?? getSearchQuery(view.state);
    if (!query.search || !query.valid) {
      countEl.textContent = '';
      return;
    }
    const { current, total, capped } = countMatches(view, query);
    const totalText = capped ? `${COUNT_LIMIT}+` : `${total}`;
    countEl.textContent = current > 0 ? `${current}/${totalText}` : `${totalText}`;
    countEl.classList.toggle('cm-search-count-none', total === 0);
  }

  searchField.addEventListener('input', commit);
  replaceField.addEventListener('input', commit);

  const dom = document.createElement('div');
  dom.className = 'cm-search';
  dom.addEventListener('keydown', (e: KeyboardEvent) => {
    if (runScopeHandlers(view, e, 'search-panel')) {
      e.preventDefault();
    } else if (e.key === 'Enter' && e.target === searchField) {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(view);
    } else if (e.key === 'Enter' && e.target === replaceField) {
      e.preventDefault();
      replaceNext(view);
    }
  });

  const row1 = document.createElement('div');
  row1.className = 'cm-search-row';
  row1.append(
    searchField,
    button('next', () => findNext(view)),
    button('previous', () => findPrevious(view)),
    button('all', () => selectMatches(view)),
    caseLabel,
    reLabel,
    wordLabel,
    countEl,
  );

  const row2 = document.createElement('div');
  row2.className = 'cm-search-row';
  row2.append(
    replaceField,
    button('replace', () => replaceNext(view)),
    button('replace all', () => replaceAll(view)),
  );

  const close = document.createElement('button');
  close.name = 'close';
  close.type = 'button';
  close.setAttribute('aria-label', 'close');
  close.textContent = '×';
  close.addEventListener('click', () => closeSearchPanel(view));

  dom.append(row1, row2, close);

  return {
    dom,
    mount() {
      searchField.select();
      refreshCount();
    },
    update(update: ViewUpdate) {
      let queryChanged = false;
      for (const tr of update.transactions)
        for (const effect of tr.effects)
          if (effect.is(setSearchQuery)) {
            queryChanged = true;
            const q = effect.value as SearchQuery;
            // 외부에서(예: 선택 텍스트로 검색 시작) 쿼리가 바뀐 경우 입력창 동기화
            if (q.search !== normalizeSearchInput(searchField.value))
              searchField.value = q.search;
          }
      if (queryChanged || update.docChanged || update.selectionSet) refreshCount();
    },
  };
}
