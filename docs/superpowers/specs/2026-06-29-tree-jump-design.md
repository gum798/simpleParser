# 트리 개선: 좌측 분할 · 본문 폰트 · 클릭 이동 (Design Spec)

- 날짜: 2026-06-29
- 상태: 승인됨 (구현 계획 작성 전)
- 기반: 기존 simpleParser (CodeMirror 6 · 바닐라 TS · Vite 단일파일 · Cloudflare Pages)

## 1. 개요 & 성공 기준

트리 뷰를 더 쓸모 있게 만드는 3가지:
1. **레이아웃**: 트리를 열면 에디터와 **좌우 분할**(왼쪽 트리·오른쪽 에디터)로 보인다.
2. **폰트**: 트리 글자 크기·계열을 에디터 본문(`.cm-content`)과 동일하게.
3. **클릭 이동**: 트리 노드를 클릭하면 에디터가 해당 소스 위치로 **스크롤 + 그 범위를 선택**한다. 전체 포맷 지원(JSON/YAML은 정확, XML/HTML은 근사).

### 검증 가능한 성공 기준
- 트리 열면 왼쪽에 트리, 오른쪽에 에디터가 동시에 보이고, 닫으면 에디터가 전체폭으로 복귀
- 트리 글자 크기가 에디터 본문과 동일
- JSON/YAML: 노드 클릭 → 에디터가 그 노드의 **정확한 소스 범위**를 선택하고 보이도록 스크롤
- XML/HTML: 노드 클릭 → 노드 토큰을 에디터에서 검색해 **근사 범위**를 선택·스크롤(못 찾으면 아무 동작 없음, 크래시 없음)
- 기존 기능(정렬/트리/미리보기/저장/하이라이트/JSON 추출)에 회귀 없음, 단일 `dist/index.html` 유지

## 2. 위치 추적 방식 (A안)

| 포맷 | 위치 확보 | 정확도 |
|---|---|---|
| JSON | `jsonc-parser.parseTree(text)` → `Node.offset`/`length`로 각 노드 `pos:{from,to}` | 정확 |
| YAML | `yaml`의 `parseDocument` AST 노드 `.range`([start, end]) | 정확 |
| XML/HTML | DOMParser는 소스 위치 미제공 → `pos` 없음. 클릭 시 노드 토큰을 에디터 텍스트에서 검색 | 근사 |

- (대안 B: 전부 텍스트 검색 — JSON도 부정확. 대안 C: 모든 포맷 위치추적 파서 — 과함.) A안 채택.
- **JSON 추출(로그) 모드**: 각 블록의 시작 오프셋(스캐너 `topLevelSpans`가 이미 알고 있음)을 블록 내부 노드 오프셋에 더해 에디터 절대 위치로 보정 → 추출된 JSON도 정확 이동. (단일 문서/관용 복구 모드는 텍스트 전체를 그대로 `parseTree`.)

## 3. 데이터 모델 변경

`TreeNode`에 선택적 소스 위치 추가:
```ts
interface TreeNode {
  key?: string;
  value?: string;
  type: 'object' | 'array' | 'element' | 'scalar';
  children?: TreeNode[];
  partial?: boolean;
  pos?: { from: number; to: number }; // 소스 오프셋(JSON/YAML). 없으면 클릭 시 근사 검색.
}
```

## 4. 컴포넌트 / 모듈

| 파일 | 변경 |
|---|---|
| `src/tree.ts` | JSON 빌더를 `parseTree` 기반으로(노드별 `pos` 캡처), YAML 빌더를 AST `.range` 기반으로. `renderTree(root, onJump)` — 노드 라벨 클릭 시 `onJump(node)` 호출. XML/HTML은 `pos` 없이 빌드(기존 DOM 트리 유지). |
| `src/editor.ts` | `Editor.revealRange(from, to): void` 추가 — `view.dispatch({ selection:{anchor:from, head:to}, scrollIntoView:true }); view.focus()`. |
| `src/treeJump.ts` (신규, 순수) | `approxFind(text, node): {from,to} \| null` — XML/HTML 노드의 검색 토큰(예: element→`<tag`, scalar→값)을 텍스트에서 찾아 범위 반환(없으면 null). |
| `src/ui.ts` | `renderTree(treeRoot, (node) => jumpTo(node))` 결선. `jumpTo`: `node.pos`면 `editor.revealRange(pos.from,pos.to)`; 아니면 `approxFind(editor.getValue(), node)` 결과로 이동. |
| `index.html` | `<main id="editor">` + `<aside id="panel">`를 좌우 분할 컨테이너 `<div id="content">`로 감싼다(트리/미리보기 패널이 왼쪽 열). |
| `src/styles.css` | `#content` flex row, `#panel` 왼쪽 열(≈34%, `order:-1`), `.tree` 폰트를 에디터 본문과 동일하게, 노드 라벨 `cursor:pointer`. |

## 5. 데이터 흐름 (클릭 이동)

1. `트리` 버튼 → `buildTree(editorValue, fmt)` → `renderTree(root, onJump)`를 좌측 `#panel`에 렌더, `#panel` 표시(좌우 분할).
2. 노드 라벨 클릭 → `onJump(node)`:
   - `node.pos` 있음(JSON/YAML) → `editor.revealRange(pos.from, pos.to)`
   - 없음(XML/HTML) → `const r = approxFind(editor.getValue(), node)` → 있으면 `editor.revealRange(r.from, r.to)`, 없으면 무동작
3. 에디터가 해당 범위를 선택하고 스크롤·포커스.

- 트리는 **현재 에디터 내용**으로 빌드되므로 오프셋이 에디터와 정합. (정렬했으면 정렬된 텍스트 기준 — 클릭 시점에도 같은 내용이면 정확.)
- 주의: 클릭과 빌드 사이 에디터를 수정하면 오프셋이 어긋날 수 있음 → 범위를 문서 길이로 클램프(크래시 방지). (재빌드 강제는 비범위.)

## 6. 에러 처리

- `revealRange`는 `from`/`to`를 `[0, doc.length]`로 클램프 → 빌드 후 편집으로 오프셋이 범위를 벗어나도 크래시 없음.
- `approxFind`가 못 찾으면 `null` → 무동작.
- JSON/YAML 파서가 일부만 복구한 경우 `pos` 없는 노드는 근사 검색 폴백(또는 무동작). 기존 트리 동작 유지.

## 7. 테스트 전략 (TDD)

- **유닛(Vitest)**:
  - `tree` JSON: 노드 `pos`가 소스의 정확한 오프셋(예: `{"a":1}`의 키 `a` 위치)
  - `tree` YAML: 노드 `pos`가 AST `.range`와 일치
  - `approxFind`: element/scalar 토큰 검색(존재/부재)
  - `renderTree`: 라벨 클릭 시 `onJump(node)` 호출(jsdom)
  - `editor.revealRange` 범위 클램프(순수 헬퍼로 분리 가능하면 단위 테스트)
- **e2e(Playwright)**: JSON 입력 → 트리 → 노드 클릭 → 에디터에 선택 범위(`.cm-selectionBackground` 또는 선택 텍스트) 확인. 좌우 분할 표시 확인.

## 8. 비범위 (YAGNI)

역방향(에디터 커서 위치 → 트리 노드 강조) / XML·HTML 정확 오프셋(위치추적 파서) / 분할 비율 드래그 조절 / 트리 검색·필터 / 클릭 후 트리 자동 재빌드.

## 9. 프로젝트 구조 (추가/수정)

```
src/treeJump.ts (신규)
수정: src/tree.ts  src/editor.ts  src/ui.ts  index.html  src/styles.css
test/ tree.test.ts(보강)  treeJump.test.ts(신규)  e2e.spec.ts(보강)
```

## 의존성

추가 런타임 의존성 없음 — 기존 `jsonc-parser`/`yaml`/CodeMirror만 사용.
