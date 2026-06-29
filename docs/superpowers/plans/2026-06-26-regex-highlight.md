# 정규식 하이라이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 정의 정규식에 매칭되는 에디터 텍스트를 지정한 글자색·배경색으로 실시간 하이라이트하고, 규칙을 localStorage에 저장해 재사용한다.

**Architecture:** 순수 매칭 로직(`highlight/matcher.ts`) + CodeMirror viewport 데코레이션 플러그인(`highlight/extension.ts`) + localStorage 영속화(`highlight/store.ts`) + 규칙 관리 UI(`rulesPanel.ts`). `editor.ts`에 `setHighlightRules`를 추가하고 `ui.ts`가 툴바 `[하이라이트]` 버튼으로 규칙 패널을 토글하며 로드/저장/에디터 갱신을 결선한다.

**Tech Stack:** TypeScript, CodeMirror 6 (`@codemirror/view`의 `Decoration`/`ViewPlugin`, `@codemirror/state`의 `StateField`/`StateEffect`), `<input type=color>`, `localStorage`, Vitest(jsdom), Playwright. **추가 런타임 의존성 없음.**

## Global Constraints

- 추가 런타임 의존성 없음 — 기존 CodeMirror 패키지 + 표준 `<input type=color>`/`localStorage`만 사용.
- 규칙은 localStorage 키 `simpleparser.highlightRules`에 저장. **공유 URL(`#`)에는 규칙을 넣지 않는다.**
- 하이라이트는 `view.visibleRanges`(보이는 영역)만 계산한다 — 대용량 입력 성능.
- 잘못된 정규식은 크래시 없이 데코에서 제외하고, 패널 행에 표시한다.
- zero-length 매칭 정규식(예: `a*`)은 무한 루프를 만들지 않는다.
- 규칙 변경(추가/삭제/토글/정규식/이름/색)은 즉시 저장 + 에디터 재하이라이트 한다.
- 기존 기능(정렬/트리/미리보기/저장/JSON 추출)에 회귀가 없어야 한다.
- tsc strict(`verbatimModuleSyntax`/`noUnusedLocals`) — 타입 전용 import는 `import type`.
- 커밋 메시지 끝 트레일러: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 새 규칙 기본값: `enabled: true`, `regex: ''`, `name: ''`, `textColor: '#000000'`, `bgColor: '#ffff00'`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/highlight/matcher.ts` | 순수: `HighlightRule` 타입, `isValidRegex`, `compileRules`, `findHighlights`(zero-length 가드) |
| `src/highlight/store.ts` | `loadRules`/`saveRules` (localStorage, 검증·실패 무시) |
| `test/setup.ts`(신규) · `vite.config.ts`(수정) | vitest+jsdom 환경에 `localStorage` 메모리 폴리필 주입(`setupFiles`) — 이 환경은 기본 localStorage 없음 |
| `src/highlight/extension.ts` | CodeMirror: `rulesField`·`highlightPlugin`·`highlightExtension`·`setHighlightRules(view,rules)`·`markStyle` |
| `src/rulesPanel.ts` | 규칙 관리 UI: `createRule`, `mountRulesPanel(container,onChange)` |
| 수정 `src/editor.ts` | `highlightExtension` 포함 + `Editor.setHighlightRules` 추가 |
| 수정 `src/ui.ts` | `[하이라이트]` 버튼 → `#rules` 패널 토글, 로드/저장/에디터 갱신 결선; `AppRoot.rules` 추가 |
| 수정 `index.html` | `<aside id="rules" hidden>` 추가 |
| 수정 `src/main.ts` | `#rules` 엘리먼트를 `mountApp`에 전달 |
| 수정 `src/styles.css` | 규칙 패널/행 스타일 |
| 수정 `test/e2e.spec.ts` | 하이라이트 시나리오 추가 |

---

## Task 1: 순수 매칭 (highlight/matcher.ts)

**Files:**
- Create: `src/highlight/matcher.ts`
- Test: `test/highlight-matcher.test.ts`

**Interfaces:**
- Consumes: 없음 (순수)
- Produces:
  - `interface HighlightRule { id:string; name:string; regex:string; enabled:boolean; textColor:string; bgColor:string }`
  - `interface CompiledRule { rule:HighlightRule; re:RegExp|null }` (re가 null이면 비활성/빈/무효)
  - `interface HighlightSpan { from:number; to:number; rule:HighlightRule }`
  - `isValidRegex(pattern:string):boolean` (빈 문자열은 true)
  - `compileRules(rules:HighlightRule[]):CompiledRule[]`
  - `findHighlights(text:string, compiled:CompiledRule[]):HighlightSpan[]`

- [ ] **Step 1: 실패 테스트 작성**

`test/highlight-matcher.test.ts`:
```ts
import { test, expect } from 'vitest';
import { isValidRegex, compileRules, findHighlights, type HighlightRule } from '../src/highlight/matcher';

function rule(p: Partial<HighlightRule>): HighlightRule {
  return { id: 'x', name: '', regex: '', enabled: true, textColor: '#000000', bgColor: '#ffff00', ...p };
}

test('isValidRegex: 유효/무효/빈값', () => {
  expect(isValidRegex('a.*b')).toBe(true);
  expect(isValidRegex('(')).toBe(false);
  expect(isValidRegex('')).toBe(true);
});

test('findHighlights: 전역 다중 매칭 범위', () => {
  const spans = findHighlights('hello hi hello', compileRules([rule({ regex: 'hello' })]));
  expect(spans.map((s) => [s.from, s.to])).toEqual([[0, 5], [9, 14]]);
});

test('findHighlights: 비활성/무효 규칙 제외, 크래시 없음', () => {
  const spans = findHighlights('aaa', compileRules([
    rule({ regex: 'a', enabled: false }),
    rule({ regex: '(' }), // 무효
  ]));
  expect(spans).toHaveLength(0);
});

test('findHighlights: 여러 규칙이 겹쳐도 각각 span', () => {
  const spans = findHighlights('abc', compileRules([rule({ id: 'r1', regex: 'ab' }), rule({ id: 'r2', regex: 'bc' })]));
  expect(spans).toHaveLength(2);
});

test('findHighlights: zero-length 정규식도 무한루프 없이 종료', () => {
  const spans = findHighlights('aa', compileRules([rule({ regex: 'a*' })]));
  expect(spans).toEqual([{ from: 0, to: 2, rule: expect.objectContaining({ regex: 'a*' }) }]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/highlight-matcher.test.ts`
Expected: FAIL (`Cannot find module '../src/highlight/matcher'`).

- [ ] **Step 3: 구현**

`src/highlight/matcher.ts`:
```ts
export interface HighlightRule {
  id: string;
  name: string;
  regex: string;
  enabled: boolean;
  textColor: string;
  bgColor: string;
}

export interface CompiledRule {
  rule: HighlightRule;
  re: RegExp | null; // null = 비활성/빈/무효 → 매칭 안 함
}

export interface HighlightSpan {
  from: number;
  to: number;
  rule: HighlightRule;
}

export function isValidRegex(pattern: string): boolean {
  if (pattern === '') return true; // 입력 중 빈 값은 무효로 보지 않음
  try {
    new RegExp(pattern, 'g');
    return true;
  } catch {
    return false;
  }
}

export function compileRules(rules: HighlightRule[]): CompiledRule[] {
  return rules.map((rule) => {
    if (!rule.enabled || rule.regex === '') return { rule, re: null };
    try {
      return { rule, re: new RegExp(rule.regex, 'g') };
    } catch {
      return { rule, re: null };
    }
  });
}

export function findHighlights(text: string, compiled: CompiledRule[]): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  for (const { rule, re } of compiled) {
    if (!re) continue;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const from = m.index;
      const to = from + m[0].length;
      if (to > from) spans.push({ from, to, rule });
      if (re.lastIndex === m.index) re.lastIndex++; // zero-length 매칭 전진 보장
    }
  }
  return spans;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/highlight-matcher.test.ts` → PASS (5 passed).
Run: `npx tsc --noEmit` → 클린.

- [ ] **Step 5: 커밋**

```bash
git add src/highlight/matcher.ts test/highlight-matcher.test.ts
git commit -m "feat: add highlight rule matcher (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 영속화 (highlight/store.ts)

**Files:**
- Create: `src/highlight/store.ts`, `test/setup.ts` (vitest용 localStorage 폴리필)
- Modify: `vite.config.ts` (`test.setupFiles` 등록)
- Test: `test/highlight-store.test.ts`

**Interfaces:**
- Consumes: `HighlightRule` (Task 1)
- Produces: `loadRules():HighlightRule[]`, `saveRules(rules:HighlightRule[]):void`

> ⚠️ 이 저장소의 vitest+jsdom(Node) 환경은 기본적으로 `localStorage`를 제공하지 않는다(접근 시 `undefined`). store **테스트**가 돌 수 있도록 먼저 메모리 폴리필을 `setupFiles`로 주입한다. (브라우저/실서비스엔 실제 localStorage가 있으므로 `store.ts` 구현 자체는 폴리필과 무관 — 구현의 `try/catch`는 그대로 유지.)

- [ ] **Step 1: 테스트용 localStorage 폴리필 주입**

`test/setup.ts` (신규):
```ts
class MemoryStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
}
(globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
```

`vite.config.ts`의 `test` 블록에 `setupFiles` 추가(기존 `environment`/`include` 유지):
```ts
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
```

- [ ] **Step 2: 실패 테스트 작성**

`test/highlight-store.test.ts`:
```ts
import { test, expect, beforeEach } from 'vitest';
import { loadRules, saveRules } from '../src/highlight/store';
import type { HighlightRule } from '../src/highlight/matcher';

const r: HighlightRule = { id: 'a', name: 'n', regex: 'x', enabled: true, textColor: '#000000', bgColor: '#ffff00' };

beforeEach(() => localStorage.clear());

test('save → load 라운드트립', () => {
  saveRules([r]);
  expect(loadRules()).toEqual([r]);
});

test('없으면 빈 배열', () => {
  expect(loadRules()).toEqual([]);
});

test('손상된 값은 빈 배열', () => {
  localStorage.setItem('simpleparser.highlightRules', '{not json');
  expect(loadRules()).toEqual([]);
});

test('배열이지만 형식이 틀린 항목은 걸러냄', () => {
  localStorage.setItem('simpleparser.highlightRules', JSON.stringify([r, { id: 1 }]));
  expect(loadRules()).toEqual([r]);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run test/highlight-store.test.ts`
Expected: FAIL (`Cannot find module '../src/highlight/store'`). (setupFiles 폴리필 덕분에 `localStorage.clear()`는 더 이상 던지지 않는다.)

- [ ] **Step 4: 구현**

`src/highlight/store.ts`:
```ts
import type { HighlightRule } from './matcher';

const KEY = 'simpleparser.highlightRules';

function isRule(x: unknown): x is HighlightRule {
  const r = x as Record<string, unknown>;
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.regex === 'string' &&
    typeof r.enabled === 'boolean' &&
    typeof r.textColor === 'string' &&
    typeof r.bgColor === 'string'
  );
}

export function loadRules(): HighlightRule[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRule) : [];
  } catch {
    return [];
  }
}

export function saveRules(rules: HighlightRule[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rules));
  } catch {
    /* 프라이빗 모드 등 접근 실패 → 무시(메모리에서만 동작) */
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run test/highlight-store.test.ts` → PASS (4 passed). `npm test` → 전체 회귀 PASS(폴리필이 다른 테스트에 영향 없음). `npx tsc --noEmit` → 클린.

- [ ] **Step 6: 커밋**

```bash
git add src/highlight/store.ts test/setup.ts vite.config.ts test/highlight-store.test.ts
git commit -m "feat: add highlight rule localStorage persistence (+ test localStorage polyfill)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: CodeMirror 확장 + 에디터 통합 (highlight/extension.ts, editor.ts)

**Files:**
- Create: `src/highlight/extension.ts`
- Modify: `src/editor.ts` (확장 포함 + `setHighlightRules`)
- Test: `test/highlight-extension.test.ts`

**Interfaces:**
- Consumes: `compileRules`, `findHighlights`, `CompiledRule`, `HighlightRule` (Task 1); CodeMirror.
- Produces:
  - `markStyle(rule:{textColor:string;bgColor:string}):string` → `'color:<t>;background-color:<b>'`
  - `highlightExtension: Extension`
  - `setHighlightRules(view:EditorView, rules:HighlightRule[]):void`
  - `Editor.setHighlightRules(rules:HighlightRule[]):void` (editor.ts)

- [ ] **Step 1: 실패 테스트 작성**

`test/highlight-extension.test.ts`:
```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/highlight-extension.test.ts`
Expected: FAIL (`Cannot find module '../src/highlight/extension'`).

- [ ] **Step 3: 구현 — `src/highlight/extension.ts`**

```ts
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
```

- [ ] **Step 4: editor.ts 수정**

`src/editor.ts` 상단 import에 추가:
```ts
import { highlightExtension, setHighlightRules as applyHighlightRules } from './highlight/extension';
```

`Editor` 인터페이스에 메서드 추가(기존 인터페이스 내부에 한 줄):
```ts
  setHighlightRules(rules: HighlightRule[]): void;
```
이를 위해 같은 파일 import에 타입 추가:
```ts
import type { Diagnostic, Format } from './types';
import type { HighlightRule } from './highlight/matcher';
```

`createEditor`의 `EditorState.create({... extensions: [...]})` 배열에 `highlightExtension`을 추가하고(기존 `lintGutter()` 다음 줄 등), 반환 객체에 메서드 추가:
```ts
    setHighlightRules: (rules) => applyHighlightRules(view, rules),
```

(주의: `applyHighlightRules`는 `view`를 캡처해야 하므로 `createEditor` 내부의 `view` 변수를 사용한다.)

- [ ] **Step 5: 테스트 통과 + 회귀 확인**

Run: `npx vitest run test/highlight-extension.test.ts` → PASS (2 passed).
Run: `npm test` → 기존 포함 전체 PASS.
Run: `npx tsc --noEmit` → 클린.

- [ ] **Step 6: 커밋**

```bash
git add src/highlight/extension.ts src/editor.ts test/highlight-extension.test.ts
git commit -m "feat: add CodeMirror highlight extension and wire into editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 규칙 패널 UI (rulesPanel.ts)

**Files:**
- Create: `src/rulesPanel.ts`
- Test: `test/rulesPanel.test.ts`

**Interfaces:**
- Consumes: `HighlightRule`, `isValidRegex` (Task 1).
- Produces:
  - `createRule():HighlightRule` (기본값 규칙, `crypto.randomUUID()` id)
  - `mountRulesPanel(container:HTMLElement, onChange:(rules:HighlightRule[])=>void): { render(rules:HighlightRule[]):void }`
- 동작: 텍스트/색/토글 변경은 패널을 다시 그리지 않고 `onChange`만 호출(입력 포커스 보존). 추가/삭제만 재렌더.

- [ ] **Step 1: 실패 테스트 작성**

`test/rulesPanel.test.ts`:
```ts
import { test, expect, vi } from 'vitest';
import { createRule, mountRulesPanel } from '../src/rulesPanel';

test('createRule 기본값', () => {
  const r = createRule();
  expect(r.enabled).toBe(true);
  expect(r.regex).toBe('');
  expect(r.textColor).toBe('#000000');
  expect(r.bgColor).toBe('#ffff00');
  expect(r.id).toBeTruthy();
});

test('규칙 추가 → onChange가 +1 규칙으로 호출', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const panel = mountRulesPanel(host, onChange);
  panel.render([]);
  (host.querySelector('.rule-add') as HTMLButtonElement).click();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0]).toHaveLength(1);
});

test('정규식 입력은 패널을 재렌더하지 않고 같은 input을 유지', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const panel = mountRulesPanel(host, onChange);
  panel.render([createRule()]);
  const input = host.querySelector('input.rule-regex') as HTMLInputElement;
  input.value = 'hello';
  input.dispatchEvent(new Event('input'));
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls.at(-1)![0][0].regex).toBe('hello');
  expect(host.querySelector('input.rule-regex')).toBe(input); // 동일 노드 = 포커스 보존
});

test('잘못된 정규식은 input에 invalid 클래스', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const panel = mountRulesPanel(host, onChange);
  panel.render([createRule()]);
  const input = host.querySelector('input.rule-regex') as HTMLInputElement;
  input.value = '(';
  input.dispatchEvent(new Event('input'));
  expect(input.classList.contains('invalid')).toBe(true);
});

test('삭제 → onChange가 빈 배열로 호출', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const panel = mountRulesPanel(host, onChange);
  panel.render([createRule()]);
  (host.querySelector('.rule-del') as HTMLButtonElement).click();
  expect(onChange.mock.calls.at(-1)![0]).toHaveLength(0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/rulesPanel.test.ts`
Expected: FAIL (`Cannot find module '../src/rulesPanel'`).

- [ ] **Step 3: 구현**

`src/rulesPanel.ts`:
```ts
import { isValidRegex, type HighlightRule } from './highlight/matcher';

export function createRule(): HighlightRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    regex: '',
    enabled: true,
    textColor: '#000000',
    bgColor: '#ffff00',
  };
}

export interface RulesPanelHandle {
  render(rules: HighlightRule[]): void;
}

export function mountRulesPanel(
  container: HTMLElement,
  onChange: (rules: HighlightRule[]) => void,
): RulesPanelHandle {
  let rules: HighlightRule[] = [];

  function commit(): void {
    onChange(rules);
  }
  function structuralChange(next: HighlightRule[]): void {
    rules = next;
    draw();
    commit();
  }
  function patch(id: string, p: Partial<HighlightRule>): void {
    rules = rules.map((r) => (r.id === id ? { ...r, ...p } : r));
    commit(); // 재렌더 안 함 → 입력 포커스 유지
  }

  function draw(): void {
    container.innerHTML = '';
    for (const rule of rules) container.appendChild(row(rule));
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'rule-add';
    add.textContent = '+ 규칙 추가';
    add.addEventListener('click', () => structuralChange([...rules, createRule()]));
    container.appendChild(add);
  }

  function row(rule: HighlightRule): HTMLElement {
    const el = document.createElement('div');
    el.className = 'rule-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'rule-enabled';
    enabled.checked = rule.enabled;
    enabled.addEventListener('change', () => patch(rule.id, { enabled: enabled.checked }));

    const regex = document.createElement('input');
    regex.type = 'text';
    regex.className = 'rule-regex';
    regex.placeholder = '정규식';
    regex.value = rule.regex;
    regex.classList.toggle('invalid', !isValidRegex(rule.regex));
    regex.addEventListener('input', () => {
      regex.classList.toggle('invalid', !isValidRegex(regex.value));
      patch(rule.id, { regex: regex.value });
    });

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'rule-name';
    name.placeholder = '이름';
    name.value = rule.name;
    name.addEventListener('input', () => patch(rule.id, { name: name.value }));

    const text = colorInput(rule.textColor, (v) => patch(rule.id, { textColor: v }), 'rule-text');
    const bg = colorInput(rule.bgColor, (v) => patch(rule.id, { bgColor: v }), 'rule-bg');

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'rule-del';
    del.textContent = '✕';
    del.addEventListener('click', () => structuralChange(rules.filter((r) => r.id !== rule.id)));

    el.append(enabled, regex, name, text, bg, del);
    return el;
  }

  return {
    render(next: HighlightRule[]): void {
      rules = next;
      draw();
    },
  };
}

function colorInput(value: string, on: (v: string) => void, cls: string): HTMLInputElement {
  const c = document.createElement('input');
  c.type = 'color';
  c.className = cls;
  c.value = value;
  c.addEventListener('input', () => on(c.value));
  return c;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/rulesPanel.test.ts` → PASS (5 passed). `npx tsc --noEmit` → 클린.

- [ ] **Step 5: 커밋**

```bash
git add src/rulesPanel.ts test/rulesPanel.test.ts
git commit -m "feat: add highlight rules management panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: UI 결선 (ui.ts, index.html, main.ts, styles.css)

**Files:**
- Modify: `src/ui.ts`, `index.html`, `src/main.ts`, `src/styles.css`
- Test: 기존 유닛 회귀 + 빌드 (e2e는 Task 6)

**Interfaces:**
- Consumes: `mountRulesPanel`/`createRule` (Task 4), `loadRules`/`saveRules` (Task 2), `editor.setHighlightRules` (Task 3).
- Produces: `AppRoot`에 `rules: HTMLElement` 추가. 툴바 `[하이라이트]` 버튼 + `#rules` 패널 토글.

- [ ] **Step 1: index.html 수정**

`<aside id="panel" hidden></aside>` 다음 줄에 추가:
```html
    <aside id="rules" hidden></aside>
```

- [ ] **Step 2: main.ts 수정**

DOM 조회·전달에 `rules` 추가:
```ts
const rules = document.getElementById('rules');
...
if (toolbar && editorHost && panel && status && toast && rules) {
  mountApp({ toolbar, editorHost, panel, status, toast, rules });
}
```

- [ ] **Step 3: ui.ts 수정 — 결선**

`AppRoot` 인터페이스에 추가:
```ts
  rules: HTMLElement;
```

ui.ts 상단 import 추가:
```ts
import { mountRulesPanel } from './rulesPanel';
import { loadRules, saveRules } from './highlight/store';
```

`mountApp` 내부, 툴바 버튼 생성부에 `[하이라이트]` 버튼 추가(저장하기 버튼 앞 또는 뒤):
```ts
  const highlightBtn = button('하이라이트');
  root.toolbar.append(select, formatBtn, viewBtn, highlightBtn, saveBtn);
```
(기존 `root.toolbar.append(select, formatBtn, viewBtn, saveBtn);` 한 줄을 위 한 줄로 교체)

`createEditor(...)` 호출 다음에 하이라이트 규칙 로드 + 패널 마운트 결선 추가:
```ts
  const rulesPanel = mountRulesPanel(root.rules, (rs) => {
    saveRules(rs);
    editor.setHighlightRules(rs);
  });
  {
    const loaded = loadRules();
    rulesPanel.render(loaded);
    editor.setHighlightRules(loaded);
  }

  highlightBtn.addEventListener('click', () => {
    root.rules.hidden = !root.rules.hidden;
  });
```

- [ ] **Step 4: styles.css 추가**

파일 끝에 추가:
```css
#rules { max-height: 40vh; overflow: auto; padding: 8px; border-top: 1px solid #8884;
  display: flex; flex-direction: column; gap: 6px; }
.rule-row { display: flex; gap: 6px; align-items: center; }
.rule-row input.rule-regex { flex: 1; font-family: ui-monospace, monospace; }
.rule-row input.rule-regex.invalid { outline: 1px solid #c0392b; background: #c0392b22; }
.rule-row input[type="color"] { width: 28px; height: 24px; padding: 0; }
.rule-del { background: none; border: none; cursor: pointer; }
.rule-add { align-self: flex-start; }
```

- [ ] **Step 5: 회귀 + 빌드 확인**

Run: `npm test` → 전체 PASS(이전 합계 유지). `npx tsc --noEmit` → 클린. `npm run build && ls dist` → 단일 `dist/index.html` + `_headers`.

- [ ] **Step 6: 커밋**

```bash
git add src/ui.ts index.html src/main.ts src/styles.css
git commit -m "feat: wire highlight rules panel into the app

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: E2E (test/e2e.spec.ts)

**Files:**
- Modify: `test/e2e.spec.ts`

**Interfaces:**
- Consumes: 빌드된 앱.
- Produces: (검증 전용)

- [ ] **Step 1: 테스트 추가**

`test/e2e.spec.ts` 끝에 추가:
```ts
test('하이라이트 규칙 추가 → 매칭 텍스트 강조 + 새로고침 유지', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello world hello');

  await page.getByRole('button', { name: '하이라이트' }).click();
  await page.getByRole('button', { name: '+ 규칙 추가' }).click();
  await page.locator('#rules .rule-regex').first().fill('hello');

  // 매칭 텍스트에 배경 스타일이 입은 mark 출현
  await expect(page.locator('.cm-content span[style*="background-color"]').first()).toBeVisible();

  // 새로고침 후에도 규칙이 localStorage에서 복원
  await page.reload();
  await page.getByRole('button', { name: '하이라이트' }).click();
  await expect(page.locator('#rules .rule-regex').first()).toHaveValue('hello');
});
```

- [ ] **Step 2: 빌드 + e2e 실행**

Run: `npm run e2e`
Expected: 기존 + 신규 전부 PASS. (CodeMirror·localStorage는 실제 브라우저에서 동작.)

- [ ] **Step 3: 커밋**

```bash
git add test/e2e.spec.ts
git commit -m "test: add e2e for regex highlight + persistence

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검)

**1. 스펙 커버리지:** §2 데이터모델→T1; §3 모듈→T1-T5; §4 viewport 데코→T3(`buildDecorations`가 `view.visibleRanges`만); §5 localStorage·URL 미포함→T2·T5(공유 URL 인코딩은 기존 `urlState`만 사용, 규칙 미포함); §6 UI 토글→T5; §7 에러(무효 정규식·localStorage 실패·zero-length)→T1·T2; §8 테스트→각 T; §9 비범위 준수(플래그 UI·공유·import/export 없음). 누락 없음.

**2. Placeholder 스캔:** "TBD/이후구현" 없음. 모든 코드 단계에 실제 코드 포함.

**3. 타입 일관성:** `HighlightRule`(T1)이 T2·T3·T4에서 동일 사용. `compileRules`/`findHighlights`(T1) → T3에서 호출. `setHighlightRules(view,rules)`(T3) → editor.ts `Editor.setHighlightRules(rules)`(T3) → ui.ts(T5)에서 `editor.setHighlightRules` 호출. `mountRulesPanel`(T4) → ui.ts(T5) (ui.ts는 `createRule`를 import하지 않는다 — 패널 내부에서만 사용. `noUnusedLocals` 주의). `loadRules`/`saveRules`(T2) → ui.ts(T5). `markStyle`(T3) 내부 사용. `AppRoot.rules`(T5) ↔ main.ts(T5) 일치. 일관됨.

**4. 테스트 환경:** Task 2에서 `test/setup.ts` localStorage 폴리필 + `vite.config.ts` `setupFiles`를 먼저 추가해야 store 테스트가 돈다(이 저장소 vitest+jsdom은 기본 localStorage 없음 — 검증으로 확인됨).
