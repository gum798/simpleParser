# simpleParser 설계 (Design Spec)

- 날짜: 2026-06-26
- 상태: 승인됨 (구현 계획 작성 전)
- 저장소: github.com/gum798/simpleParser

## 1. 개요 & 성공 기준

브라우저에서 완전히 동작하는 **다포맷 포맷터/뷰어**. 데이터를 붙여넣으면 정렬(beautify)·트리뷰·문법강조로 보여주고, 상태를 URL에 담아 공유한다. 백엔드 없음.

v1 지원 포맷: **JSON · HTML · XML · YAML · Markdown**. 앞의 넷은 정렬 + 트리뷰, **Markdown은 렌더링된 HTML 미리보기**로 본다.

문법이 일부 틀려도 **최대한 파싱(best-effort)** 하고, **어디가 문제인지** 줄·열 위치와 메시지로 알려준다.

### 검증 가능한 성공 기준
- JSON·HTML·XML·YAML 각각: 유효 입력 → 올바른 정렬, 무효 입력 → **부분 결과 + 에러 위치 표시**(크래시 없음)
- 자동 감지가 명확한 샘플에서 정확한 포맷 선택
- `공유` 링크 → 새로고침/새 탭에서 `{포맷, 내용}` 무손실 복원 (유니코드 포함)
- 깨진 입력(예: 콤마 빠진 JSON, 들여쓰기 틀린 YAML, 안 닫힌 태그)에서 **에러 줄:열**이 표시되고 가능한 부분까지 정렬/트리가 보임
- **Markdown**: 입력을 렌더링한 HTML **미리보기**(GitHub 스타일)로 보여주고, 출력은 **DOMPurify로 정화(sanitize)** 되어 공유 링크의 XSS를 방지
- `npm run build` → **외부 네트워크 의존 0인 단일 `dist/index.html`** 산출, Cloudflare Pages에서 동작
- 데이터는 URL **프래그먼트(`#`)에만** 존재 → 서버로 전송되지 않음

## 2. 아키텍처

순수 클라이언트 SPA, 프레임워크 없음(바닐라 TypeScript + CodeMirror 6). "simple" 유지를 위해 React/Vue 미사용.

```
[브라우저]
  index.html ── main.ts (부트스트랩)
                 ├─ editor.ts   (CodeMirror 6: 편집 + 문법강조 + 인라인 진단)
                 ├─ detect.ts   (포맷 자동 감지)
                 ├─ format/*    (포맷별 정렬 + best-effort + 진단)
                 ├─ tree.ts     (파싱 → 접이식 트리 렌더)
                 ├─ preview.ts  (Markdown 렌더 → DOMPurify 정화 → 미리보기)
                 ├─ urlState.ts (상태 ↔ URL 프래그먼트)
                 └─ ui.ts       (툴바·버튼·토스트·상태줄)

[빌드]   Vite + vite-plugin-singlefile → dist/index.html (CSS·JS 전부 인라인)
[배포]   Cloudflare Pages (정적). Worker/KV 없음.
```

## 3. 컴포넌트 (각 모듈 = 단일 책임, 명확한 인터페이스)

| 모듈 | 역할 | 핵심 인터페이스 |
|---|---|---|
| `editor.ts` | CodeMirror 인스턴스, 언어 전환, 내용 get/set, 진단(밑줄) 표시 | `createEditor()`, `setLanguage(fmt)`, `getValue()`, `setValue(s)`, `setDiagnostics(d[])` |
| `detect.ts` | 텍스트 → 포맷 추정 | `detectFormat(text): Format \| 'unknown'` |
| `format/index.ts` | 포맷별 정렬 디스패처 | `format(text, fmt): FormatResult` |
| `format/{json,html,xml,yaml}.ts` | 개별 포맷터(관용 파싱 + 진단) | 각 `(text) => FormatResult` |
| `tree.ts` | 파싱 → 공통 `TreeNode` 모델 → DOM 트리 | `buildTree(text, fmt): TreeResult`, `renderTree(root)` |
| `preview.ts` | Markdown 렌더 → DOMPurify 정화 → 미리보기 DOM | `renderMarkdown(text): PreviewResult` |
| `urlState.ts` | 상태 ↔ 프래그먼트 인코딩 | `encode(state): string`, `decode(hash): State \| null` |
| `ui.ts` | 툴바/버튼/토스트/상태줄/에러 표시 | `mountToolbar()`, `toast(msg)`, `showDiagnostics(d[])` |
| `types.ts` | 공유 타입 | `Format`, `State`, `TreeNode`, `Diagnostic`, `FormatResult`, `TreeResult` |

### 공유 타입
```ts
type Format = 'json' | 'html' | 'xml' | 'yaml' | 'markdown';

interface Diagnostic {
  message: string;     // 사람이 읽는 설명
  line?: number;       // 1-기준
  col?: number;        // 1-기준
  offset?: number;     // 문자 오프셋(가능하면) — CodeMirror 밑줄용
  length?: number;     // 강조 길이(기본 1)
  severity: 'error' | 'warning';
}

interface FormatResult {
  output?: string;        // 가능한 한 정렬된 결과(부분이라도)
  diagnostics: Diagnostic[]; // 비었으면 완전 성공
}

interface TreeNode {
  key?: string;
  value?: string;
  type: 'object' | 'array' | 'element' | 'scalar';
  children?: TreeNode[];
  partial?: boolean;      // 복구로 채운 노드 표시
}

interface TreeResult {
  root?: TreeNode;
  diagnostics: Diagnostic[];
}

interface PreviewResult {
  html: string;            // DOMPurify로 정화된 안전한 HTML
  diagnostics: Diagnostic[];
}

interface State { v: 1; f: Format; d: string }
```

`TreeNode`로 4개 포맷을 하나의 트리 모델로 통일해 `renderTree`는 포맷을 모른다.

## 4. 데이터 흐름

1. **로드**: `location.hash` → `urlState.decode` → `{format, content}` → 에디터·드롭다운 세팅. 해시 없으면 빈 상태.
2. **입력(타이핑/붙여넣기)**: 변경 → (디바운스) 자동 모드면 `detectFormat`로 드롭다운 갱신 → (디바운스) 현재 상태를 해시에 저장(새로고침 복원).
3. **`정렬`**: `format(content, fmt)` → `output`이 있으면 에디터 내용 교체(부분 결과 포함), `diagnostics`는 인라인 밑줄 + 상태줄에 표시. 원문이 더 안전하면 보존 정책(아래 8장) 적용. (Markdown은 정렬 버튼 비활성 — §11)
4. **뷰 토글(포맷별)**: JSON/HTML/XML/YAML → `트리`: `buildTree` → `root`가 있으면 트리 패널 토글(부분 트리 포함). Markdown → `미리보기`: `renderMarkdown` → 정화된 HTML을 미리보기 패널에 표시. 둘 다 `diagnostics` 표시.
5. **`공유`**: 해시 최신화 → 전체 URL 클립보드 복사 → 토스트. URL이 매우 길면(임계 초과) 비차단 경고.

툴바 버튼은 현재 포맷에 따라 바뀐다: JSON/HTML/XML/YAML = `[정렬] [트리]`, Markdown = `[미리보기]`.

## 5. URL 저장 설계

- **프래그먼트 사용**(쿼리 아님): `#`는 서버로 전송 안 됨 → 프라이버시 + 서버 URL 길이 제한 회피.
- 인코딩: `hash = lzString.compressToEncodedURIComponent(JSON.stringify({ v:1, f, d }))`
  - `v`=스키마 버전(향후 호환), `f`=포맷, `d`=원문 텍스트
- 디코딩: 역순, 실패/구버전이면 `null` 반환 → 빈 상태로 시작
- **크기 가드**: 압축 결과가 임계(기본 10,000자) 초과 시 "링크가 큽니다(일부 메신저에서 잘릴 수 있음)" 경고만, 차단은 안 함

## 6. 포맷별 처리 (정렬 · 트리 · 감지)

| 포맷 | 감지 | 정렬 | 트리 파싱 | CM 언어팩 |
|---|---|---|---|---|
| JSON | `JSON.parse` 성공 또는 `jsonc-parser`가 객체로 인식 | 유효 시 내장 `JSON.stringify(…,2)`, 무효 시 `jsonc-parser` 복구 트리 → 재직렬화 | `jsonc-parser` → 객체(복구 포함) | `@codemirror/lang-json` |
| XML | `<?xml` 시작 또는 엄격 파싱 성공 | `xml-formatter` (실패 시 html 모드 폴백) | 엄격 `DOMParser('application/xml')`; 실패 시 `text/html` 폴백 | `@codemirror/lang-xml` |
| HTML | `<`로 시작 & XML 아님 | `js-beautify`(html) | `DOMParser('text/html')` → DOM (항상 관용) | `@codemirror/lang-html` |
| YAML | `yaml`(eemeli) `parseDocument` 성공 & 위 넷 아님 (스칼라 1개가 아닌 맵/시퀀스일 때만) | 유효 시 `parseDocument` → `String(doc)`; 무효 시 부분 문서 직렬화 | `parseDocument` → JS 값(복구 포함) | `@codemirror/lang-yaml` |
| Markdown | 위 넷 실패 & 마크다운 마커(`#`, `-`/`*` 목록, ```` ``` ````, `[..](..)` 등) 존재, 또는 평문 폴백 | v1 미지원(원문 유지, §11) | 트리 없음 — 대신 `미리보기`(§7) | `@codemirror/lang-markdown` |

**감지 순서**: JSON → XML → HTML → YAML → Markdown → unknown(평문은 기본 Markdown 취급). 수동 드롭다운 선택은 항상 우선.

## 7. 관용 파싱 & 에러 위치 (Best-effort parsing & diagnostics) — 핵심 기능

목표: "문법이 틀려도 최대한 파싱 + 어디가 문제인지". 포맷별 전략은 다르지만, 공통적으로 `FormatResult`/`TreeResult`가 **부분 결과 + `Diagnostic[]`** 를 반환한다.

| 포맷 | 관용 파싱 방법 | 에러 위치 출처 |
|---|---|---|
| JSON | `jsonc-parser.parseTree` / `parse` 는 에러가 있어도 가능한 노드를 복구해 트리를 반환 | `ParseError[]`의 `offset`+`length` → `Diagnostic.offset/length`, 오프셋→줄:열 변환 |
| YAML | `yaml.parseDocument` 는 에러가 있어도 부분 문서(`doc.contents`)를 채움 | `doc.errors`/`doc.warnings`의 `linePos`(line, col) + `pos`(offset) |
| XML | 1) 엄격 파싱으로 `<parsererror>` 탐지(메시지에 줄/열) → 진단, 2) `text/html` 관용 파싱으로 부분 트리 | 브라우저 `<parsererror>` 텍스트의 위치 정보(없으면 메시지만) |
| HTML | `DOMParser('text/html')` 는 절대 throw 안 함 → 항상 전체 DOM. 경고는 휴리스틱(예: 안 닫힌 것처럼 보이는 태그)으로 최소 표시 | 휴리스틱 위치(가능 시) — 과한 추정은 하지 않음 |
| Markdown | `marked` 는 어떤 입력이든 렌더링(관용적) → 미리보기는 항상 표시. 진단은 거의 없음 | 일반적으로 없음 |

표시 방식:
- **CodeMirror 인라인**: `setDiagnostics`가 `offset/length`에 밑줄 표시(@codemirror/lint 의 진단 underline)
- **상태줄**: 첫 에러를 `줄 L, 열 C: <메시지>` 로 요약, 에러 개수 표시
- **부분 결과**: `output`/`root`가 있으면 그대로 보여주되, 복구로 채운 트리 노드는 `partial` 플래그로 흐리게 표시

오프셋→줄:열 변환은 공용 헬퍼 `offsetToLineCol(text, offset)` 로 일원화.

## 8. 에러 처리 (전반)

- 모든 파싱/정렬은 예외를 잡아 `FormatResult`로 변환, 앱 크래시 없음.
- **정렬 내용 교체 정책**: `output`이 있으면 교체하되, 그 결과를 다시 파싱했을 때 진단이 **더 늘어나면** 교체를 보류하고 원문 보존 + 경고(데이터 손상 방지).
- URL 디코드 실패 → 무시하고 빈 상태(+선택적 토스트 "링크를 불러올 수 없습니다").
- **Markdown 미리보기 보안**: `marked` 출력 HTML을 **반드시 `DOMPurify.sanitize`** 한 뒤 주입. 공유 링크가 타인의 브라우저에서 열리므로 스크립트·이벤트 핸들러·`javascript:` URL을 제거(저장형 XSS 방지).
- 클립보드 실패 → URL을 복사 가능한 필드로 노출(폴백).
- 큰 입력 → 디바운스로 자동 감지/저장 부하 완화 (Web Worker 오프로딩은 v1 비범위).

## 9. 테스트 전략 (TDD)

- **유닛(Vitest)**:
  - `detect`: 각 포맷 명확 케이스 + 모호 케이스(예: `<` 시작이 XML/HTML)
  - 각 포맷터: 유효 입력(정렬 정확), **무효 입력(부분 output + 정확한 진단 줄:열)**
  - `urlState`: 라운드트립 무손실(유니코드·대용량), 손상 해시 → null
  - `tree`: 유효/복구 구조 정확성, `partial` 표시
  - `preview`(Markdown): 기본 렌더 정확성 + **정화 검증**(`<script>`, `onerror=`, `javascript:` 가 제거되는지)
  - `offsetToLineCol`: 경계값
- **스모크(Playwright 1개)**: 빌드된 `dist/index.html` 로드 → 붙여넣기 → 정렬 → 깨진 입력에서 에러 밑줄 확인 → Markdown 미리보기 → 공유 → 새로고침 복원

## 10. 배포 (Cloudflare Pages)

- 빌드 커맨드 `npm run build`, 출력 디렉터리 `dist`, 산출물 `index.html` 하나
- GitHub `gum798/simpleParser` 연결 → `main` 푸시 시 자동 배포 (또는 `wrangler pages deploy dist`)
- 단일 페이지라 라우팅 설정 불필요. Worker/KV 없음.

## 11. 비범위 (YAGNI, 이후 확장)

백엔드·short URL·KV / 포맷 변환기 / CSV·JS·CSS·SQL 등 추가 포맷 / **Markdown 정렬(prettify)** / **HTML 라이브 렌더링**(Markdown만 미리보기 제공) / 로그인·서버 히스토리 / Web Worker / 다중 테마

## 12. 프로젝트 구조

```
index.html · vite.config.ts · package.json · tsconfig.json · README.md
src/ main.ts editor.ts detect.ts urlState.ts tree.ts preview.ts ui.ts types.ts styles.css
     util/ offsetToLineCol.ts
     format/ index.ts json.ts html.ts xml.ts yaml.ts
test/ detect.test.ts format.test.ts urlState.test.ts tree.test.ts preview.test.ts e2e.spec.ts
```

## 의존성 요약

- 런타임: `codemirror` + `@codemirror/lang-{json,html,xml,yaml,markdown}` + `@codemirror/lint`, `jsonc-parser`, `yaml`(eemeli), `js-beautify`, `xml-formatter`, `marked`, `dompurify`, `lz-string`
- 개발: `vite`, `vite-plugin-singlefile`, `typescript`, `vitest`, `@playwright/test`
