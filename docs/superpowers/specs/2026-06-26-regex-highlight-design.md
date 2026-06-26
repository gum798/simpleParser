# 정규식 하이라이트 설계 (Design Spec)

- 날짜: 2026-06-26
- 상태: 승인됨 (구현 계획 작성 전)
- 기반: 기존 simpleParser (CodeMirror 6 · 바닐라 TS · Vite 단일파일 · Cloudflare Pages)

## 1. 개요 & 성공 기준

에디터 텍스트에서 사용자 정의 **정규식에 매칭되는 부분**을 지정한 **글자색·배경색**으로 하이라이트한다. 규칙은 내 브라우저(localStorage)에 저장돼 여러 입력에 재사용한다. (로그 필드 색상 구분 같은 용도)

### 검증 가능한 성공 기준
- 규칙 추가/수정/삭제, 활성 토글, 글자색·배경색 지정 → 에디터 매칭 텍스트에 **실시간** 반영
- 규칙은 **localStorage**에 저장 → 새로고침/재방문 시 유지
- **잘못된 정규식**은 크래시 없이 무시 + 패널 행에 표시
- 큰 입력에서도 빠름 — **보이는 영역(viewport)만** 계산
- **공유 URL에는 규칙 미포함** (문서 데이터만 #fragment)
- 기존 기능(정렬/트리/미리보기/공유/JSON 추출)에 회귀 없음

## 2. 데이터 모델

```ts
export interface HighlightRule {
  id: string;        // 안정적 키(추가 시 생성)
  name: string;      // 선택(빈 문자열 허용)
  regex: string;     // 사용자 입력 정규식 소스. 전역(g) 매칭
  enabled: boolean;  // 비활성 시 데코 제외
  textColor: string; // #rrggbb (기본 #000000)
  bgColor: string;   // #rrggbb (기본 #ffff00)
}
```

- `id` 생성: `crypto.randomUUID()` (브라우저·jsdom 모두 지원).
- 정규식 플래그: 항상 `g`. (대소문자 무시 등 추가 플래그 UI는 v1 비범위)

## 3. 아키텍처 / 모듈 (단일 책임)

| 파일 | 책임 | 핵심 인터페이스 |
|---|---|---|
| `src/highlight/matcher.ts` | 순수 매칭 로직 | `compileRules(rules): CompiledRule[]` (잘못된 정규식은 `valid:false`로 표시), `findHighlights(text, compiled): Span[]` where `Span = { from:number; to:number; rule:HighlightRule }` |
| `src/highlight/extension.ts` | CodeMirror 통합 | `highlightExtension`, `setHighlightRules(view, rules): void` (StateEffect로 규칙 주입) |
| `src/highlight/store.ts` | 영속화 | `loadRules(): HighlightRule[]`, `saveRules(rules): void` (localStorage, 실패 시 무시) |
| `src/rulesPanel.ts` | 규칙 관리 UI | `mountRulesPanel(container, { getRules, onChange }): void` |
| 수정 `src/editor.ts` | 하이라이트 확장 포함 + 노출 | `Editor`에 `setHighlightRules(rules: HighlightRule[]): void` 추가 |
| 수정 `src/ui.ts` | 결선 | `[하이라이트]` 버튼 → `#rules` 패널 토글, 로드/저장/에디터 갱신 |
| 수정 `index.html` | DOM | `<aside id="rules" hidden>` + 버튼 자리, `styles.css` 규칙/하이라이트 스타일 |

`matcher.ts`는 CodeMirror·DOM에 의존하지 않는 순수 함수 → 단위 테스트 용이.

## 4. CodeMirror 하이라이트 (A안: viewport 데코)

- `rulesField: StateField<CompiledRule[]>` — 현재 규칙 보유. `setRulesEffect`(StateEffect)로 교체.
- `highlightPlugin: ViewPlugin` — `view.visibleRanges`의 텍스트에 대해서만 enabled·valid 규칙별 정규식을 돌려 `findHighlights` 결과를 `Decoration.mark({ attributes: { style: 'color:<text>;background:<bg>' } })`로 변환한 `DecorationSet` 생성. `update`가 `docChanged || viewportChanged || rulesField 변경` 일 때 재계산.
- `highlightExtension = [rulesField, highlightPlugin]` — editor.ts의 확장 목록에 추가.
- 겹치는 매칭: 규칙 목록 순서대로 mark를 추가 → CodeMirror가 스택. 뒤 규칙이 시각적으로 우선(배경). 명세상 충분.
- `setHighlightRules(view, rules)`는 `compileRules` 후 `setRulesEffect`를 dispatch하고, 강제 재데코를 위해 빈 변경/`requestMeasure` 트리거.

## 5. 저장 (localStorage)

- 키: `simpleparser.highlightRules`. 값: `JSON.stringify(HighlightRule[])`.
- `loadRules`: 파싱/검증 실패·없음 → `[]`. `saveRules`: `try/catch`(프라이빗 모드 등 접근 실패 시 무시 → 메모리에서만 동작).
- mountApp 시작 시 `loadRules()` → `editor.setHighlightRules(rules)`. 규칙 변경마다 `saveRules` + `editor.setHighlightRules`.
- **공유 URL 인코딩(`urlState`)에는 규칙을 넣지 않는다.** (스펙 §1)

## 6. UI (툴바 버튼 + 규칙 패널)

- 툴바에 `[하이라이트]` 버튼 추가. 클릭 시 `#rules` 패널 토글(트리/미리보기 `#panel`과 독립적인 별도 영역, 에디터 아래).
- 패널 구성: 규칙 행마다 `☑활성 | 정규식 [______] | 이름 [____] | 글자■(color) | 배경■(color) | ✕삭제`, 하단 `[+ 규칙 추가]`.
- 색 입력: `<input type="color">` ×2 (글자/배경). 새 규칙 기본값 글자 `#000000`, 배경 `#ffff00`.
- 어떤 변경(추가/삭제/토글/정규식/이름/색)이든 즉시 `onChange(rules)` → `saveRules` + `editor.setHighlightRules` → 실시간 재하이라이트.
- 하이라이트는 패널 개폐와 무관하게 규칙이 enabled면 에디터에 항상 적용.

## 7. 에러 처리

- 잘못된 정규식: `compileRules`가 `valid:false`로 표시 → 데코에서 제외(크래시 없음) + 패널 해당 행에 빨간 테두리/`title` 툴팁.
- localStorage 접근 실패: load/save 모두 `try/catch` → 무시(메모리 동작).
- 정규식이 빈 매칭(`zero-length`)을 만들 수 있는 경우(예: `a*`): `findHighlights`는 매 반복에서 `lastIndex` 진행을 보장해 무한 루프 방지.
- 거대 입력: viewport 범위만 스캔 → 비용 제한. (Web Worker는 비범위)

## 8. 테스트 전략 (TDD)

- **유닛(Vitest)**:
  - `matcher.findHighlights`: 단순 매칭 범위, 다중 매칭(전역), 겹침, **zero-length 정규식 무한루프 방지**, 비활성/잘못된 규칙 제외
  - `matcher.compileRules`: 유효/무효 정규식 → `valid` 플래그
  - `store`: load/save 라운드트립, 손상 값 → `[]`, 저장 실패 무시(jsdom localStorage)
  - `rulesPanel` 순수 헬퍼: 기본 규칙 생성(`createRule()`), 직렬화 등
- **e2e(Playwright)**: `[하이라이트]` → 규칙 추가(정규식+배경색) → 매칭 텍스트에 배경 스타일이 입혀진 span 확인 → **새로고침 후 규칙·하이라이트 유지**(localStorage)

## 9. 비범위 (YAGNI)

규칙의 공유 URL 포함 / import·export / 정규식 플래그 UI(대소문자 무시 등) / 트리·미리보기 하이라이트 / 규칙 드래그 재정렬 / 규칙별 액션(스크린샷의 Bounce 등) / 정규식 명명 캡처 그룹 색상.

## 10. 프로젝트 구조 (추가/수정)

```
src/highlight/ matcher.ts  extension.ts  store.ts
src/rulesPanel.ts
수정: src/editor.ts  src/ui.ts  index.html  src/styles.css
test/ highlight-matcher.test.ts  highlight-store.test.ts  rulesPanel.test.ts
수정: test/e2e.spec.ts (하이라이트 시나리오 추가)
```

## 의존성

추가 런타임 의존성 없음 — CodeMirror(`@codemirror/view`의 `Decoration`/`ViewPlugin`, `@codemirror/state`의 `StateField`/`StateEffect`)와 표준 `<input type=color>`/`localStorage`만 사용.
