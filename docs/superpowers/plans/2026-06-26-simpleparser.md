# simpleParser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 완전히 동작하는 다포맷(JSON·HTML·XML·YAML·Markdown) 포맷터/뷰어를 만들고, 상태를 URL 프래그먼트에 담아 공유하며, 단일 HTML로 빌드해 Cloudflare Pages에 배포한다.

**Architecture:** 프레임워크 없는 바닐라 TypeScript 클라이언트 SPA. CodeMirror 6 에디터 + 포맷별 관용(best-effort) 파서/포맷터 + 공통 `TreeNode` 트리뷰 + Markdown 미리보기(DOMPurify 정화). 백엔드 없음 — 데이터는 `lz-string`으로 압축해 `location.hash`에만 저장. Vite + `vite-plugin-singlefile`로 모든 자산을 인라인한 단일 `dist/index.html` 산출.

**Tech Stack:** TypeScript, Vite, vite-plugin-singlefile, Vitest(jsdom), Playwright, CodeMirror 6(@codemirror/lang-{json,html,xml,yaml,markdown}, @codemirror/lint, @codemirror/state), jsonc-parser, yaml(eemeli), js-beautify, xml-formatter, marked, dompurify, lz-string.

## Global Constraints

- 런타임 의존성은 위 Tech Stack 목록으로 한정 — 새 런타임 라이브러리 추가 시 스펙 갱신 필요.
- 백엔드/서버 저장소 없음. 데이터는 오직 URL 프래그먼트(`#`)에만 존재한다.
- 모든 파싱/정렬은 예외를 던지지 않고 `{ output?/root?, diagnostics }` 형태로 결과를 반환한다 (앱 크래시 금지).
- Markdown 렌더 HTML은 페이지에 주입하기 전 **반드시 `DOMPurify.sanitize`** 를 거친다.
- v1 포맷은 정확히 5종: `json` `html` `xml` `yaml` `markdown`. Markdown은 정렬(prettify) 미지원.
- 빌드 산출물은 외부 네트워크 의존이 0인 **단일 `dist/index.html`**.
- 유닛 테스트는 Vitest + jsdom 환경(`DOMParser`, `window` 전역 사용 가능)에서 돈다.
- 커밋 메시지 끝에는 저장소 규약대로 트레일러를 붙인다:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Format 감지 우선순위: JSON → XML → HTML → YAML → Markdown(평문 폴백 포함).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html` | 빌드/테스트 도구 + 앱 셸 |
| `src/types.ts` | 공유 타입 (`Format`, `Diagnostic`, `FormatResult`, `TreeNode`, `TreeResult`, `PreviewResult`, `State`) |
| `src/util/offsetToLineCol.ts` | 문자 오프셋 → `{line,col}` 변환 |
| `src/util/debounce.ts` | 디바운스 유틸 |
| `src/detect.ts` | 텍스트 → `Format` 자동 감지 |
| `src/format/json.ts` | JSON 관용 파싱(`parseJsonTolerant`) + 정렬(`formatJson`) |
| `src/format/yaml.ts` | YAML 관용 파싱(`parseYamlTolerant`) + 정렬(`formatYaml`) |
| `src/format/xml.ts` | XML 진단 + 정렬(`formatXml`) |
| `src/format/html.ts` | HTML 정렬(`formatHtml`) |
| `src/format/index.ts` | 포맷 디스패처(`format`) |
| `src/tree.ts` | `buildTree` + `renderTree` |
| `src/preview.ts` | `renderMarkdown` (marked + DOMPurify) |
| `src/urlState.ts` | `encode`/`decode` (lz-string) |
| `src/editor.ts` | CodeMirror 래퍼 + 진단 매핑(`toCmDiagnostics`) |
| `src/ui.ts` | 툴바/상태줄/패널/토스트 + 포맷별 헬퍼(`canFormat`,`viewLabel`) |
| `src/main.ts` | 부트스트랩 — 모든 모듈 결선 |
| `src/styles.css` | 스타일 |
| `test/*.test.ts` | Vitest 유닛 |
| `test/e2e.spec.ts` | Playwright 스모크 |
| `README.md` | 사용/배포 문서 |

---

## Task 1: 프로젝트 스캐폴드 & 도구 설정

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`, `.gitignore`
- Test: `test/smoke.test.ts`

**Interfaces:**
- Consumes: (없음)
- Produces: `npm test`(Vitest, jsdom), `npm run build`(단일 `dist/index.html`), `npm run dev`, `npm run preview` 스크립트.

- [ ] **Step 1: 실패 테스트 작성**

`test/smoke.test.ts`:
```ts
import { test, expect } from 'vitest';

test('vitest + jsdom 환경이 동작한다', () => {
  const el = document.createElement('div');
  el.textContent = 'ok';
  expect(el.textContent).toBe('ok');
  expect(typeof DOMParser).toBe('function');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: 명령 자체가 없어 FAIL (`Missing script: "test"`) — 스캐폴드 전이므로 정상.

- [ ] **Step 3: 스캐폴드 파일 작성**

`package.json`:
```json
{
  "name": "simpleparser",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@codemirror/lang-html": "^6.4.9",
    "@codemirror/lang-json": "^6.0.1",
    "@codemirror/lang-markdown": "^6.3.1",
    "@codemirror/lang-xml": "^6.1.0",
    "@codemirror/lang-yaml": "^6.1.2",
    "@codemirror/lint": "^6.8.4",
    "@codemirror/state": "^6.5.2",
    "@codemirror/view": "^6.36.4",
    "codemirror": "^6.0.1",
    "dompurify": "^3.2.4",
    "js-beautify": "^1.15.4",
    "jsonc-parser": "^3.3.1",
    "lz-string": "^1.5.0",
    "marked": "^15.0.7",
    "xml-formatter": "^3.6.3",
    "yaml": "^2.7.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.1",
    "@types/dompurify": "^3.0.5",
    "@types/js-beautify": "^1.14.3",
    "jsdom": "^26.0.0",
    "typescript": "^5.7.3",
    "vite": "^6.1.0",
    "vite-plugin-singlefile": "^2.1.0",
    "vitest": "^3.0.5"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "test"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2022', assetsInlineLimit: 100_000_000 },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
```

`index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>simpleParser</title>
  </head>
  <body>
    <header id="toolbar"></header>
    <main id="editor"></main>
    <aside id="panel" hidden></aside>
    <footer id="status"></footer>
    <div id="toast" hidden></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
import './styles.css';

const status = document.getElementById('status');
if (status) status.textContent = 'simpleParser 준비됨';
```

`src/styles.css`:
```css
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; display: flex; flex-direction: column; height: 100vh; }
#editor { flex: 1; overflow: auto; }
#status { padding: 4px 8px; font-size: 12px; border-top: 1px solid #8884; }
```

`.gitignore`:
```
node_modules
dist
test-results
playwright-report
```

- [ ] **Step 4: 의존성 설치 & 테스트 통과 확인**

Run: `npm install && npm test`
Expected: `smoke.test.ts` PASS (1 passed).

- [ ] **Step 5: 빌드가 단일 HTML을 내는지 확인**

Run: `npm run build && ls dist`
Expected: `dist/index.html` 하나만 존재(별도 `.js`/`.css` 없음).

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + Vitest single-file project

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 공유 타입 + offsetToLineCol 유틸

**Files:**
- Create: `src/types.ts`, `src/util/offsetToLineCol.ts`
- Test: `test/offsetToLineCol.test.ts`

**Interfaces:**
- Consumes: (없음)
- Produces:
  - `src/types.ts`: `Format='json'|'html'|'xml'|'yaml'|'markdown'`; `Diagnostic{message:string; line?:number; col?:number; offset?:number; length?:number; severity:'error'|'warning'}`; `FormatResult{output?:string; diagnostics:Diagnostic[]}`; `TreeNode{key?:string; value?:string; type:'object'|'array'|'element'|'scalar'; children?:TreeNode[]; partial?:boolean}`; `TreeResult{root?:TreeNode; diagnostics:Diagnostic[]}`; `PreviewResult{html:string; diagnostics:Diagnostic[]}`; `State{v:1; f:Format; d:string}`.
  - `offsetToLineCol(text:string, offset:number): {line:number; col:number}` — 1-기준, 범위 밖 오프셋은 클램프.

- [ ] **Step 1: 실패 테스트 작성**

`test/offsetToLineCol.test.ts`:
```ts
import { test, expect } from 'vitest';
import { offsetToLineCol } from '../src/util/offsetToLineCol';

test('오프셋 0은 1행 1열', () => {
  expect(offsetToLineCol('abc', 0)).toEqual({ line: 1, col: 1 });
});

test('첫 줄 안의 오프셋', () => {
  expect(offsetToLineCol('abc', 2)).toEqual({ line: 1, col: 3 });
});

test('개행 다음 줄의 시작', () => {
  expect(offsetToLineCol('ab\ncd', 3)).toEqual({ line: 2, col: 1 });
});

test('범위를 넘는 오프셋은 끝으로 클램프', () => {
  expect(offsetToLineCol('ab\ncd', 999)).toEqual({ line: 2, col: 3 });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/offsetToLineCol.test.ts`
Expected: FAIL (`Cannot find module '../src/util/offsetToLineCol'`).

- [ ] **Step 3: 타입 + 유틸 구현**

`src/types.ts`:
```ts
export type Format = 'json' | 'html' | 'xml' | 'yaml' | 'markdown';

export interface Diagnostic {
  message: string;
  line?: number;
  col?: number;
  offset?: number;
  length?: number;
  severity: 'error' | 'warning';
}

export interface FormatResult {
  output?: string;
  diagnostics: Diagnostic[];
}

export interface TreeNode {
  key?: string;
  value?: string;
  type: 'object' | 'array' | 'element' | 'scalar';
  children?: TreeNode[];
  partial?: boolean;
}

export interface TreeResult {
  root?: TreeNode;
  diagnostics: Diagnostic[];
}

export interface PreviewResult {
  html: string;
  diagnostics: Diagnostic[];
}

export interface State {
  v: 1;
  f: Format;
  d: string;
}
```

`src/util/offsetToLineCol.ts`:
```ts
export function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let col = 1;
  for (let i = 0; i < clamped; i++) {
    if (text[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/offsetToLineCol.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/types.ts src/util/offsetToLineCol.ts test/offsetToLineCol.test.ts
git commit -m "feat: add shared types and offsetToLineCol util

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 포맷 자동 감지 (detect.ts)

**Files:**
- Create: `src/detect.ts`
- Test: `test/detect.test.ts`

**Interfaces:**
- Consumes: `Format` (Task 2), `yaml`의 `parseDocument`, 전역 `DOMParser`.
- Produces: `detectFormat(text:string): Format` — 빈/평문은 `'markdown'`. 우선순위 JSON→XML→HTML→YAML→Markdown.

- [ ] **Step 1: 실패 테스트 작성**

`test/detect.test.ts`:
```ts
import { test, expect } from 'vitest';
import { detectFormat } from '../src/detect';

test('JSON 객체', () => expect(detectFormat('{"a":1}')).toBe('json'));
test('JSON 배열', () => expect(detectFormat('[1,2,3]')).toBe('json'));
test('XML 선언', () => expect(detectFormat('<?xml version="1.0"?><a/>')).toBe('xml'));
test('HTML 문서', () => expect(detectFormat('<!doctype html><html><body>hi</body></html>')).toBe('html'));
test('일반 마크업 div는 HTML', () => expect(detectFormat('<div class="x">hi</div>')).toBe('html'));
test('루트 커스텀 태그는 XML', () => expect(detectFormat('<note><to>a</to></note>')).toBe('xml'));
test('YAML 맵', () => expect(detectFormat('a: 1\nb: 2')).toBe('yaml'));
test('YAML 시퀀스', () => expect(detectFormat('- one\n- two')).toBe('yaml'));
test('마크다운 제목', () => expect(detectFormat('# 제목\n\n본문')).toBe('markdown'));
test('빈 문자열은 markdown', () => expect(detectFormat('   ')).toBe('markdown'));
test('평문은 markdown 폴백', () => expect(detectFormat('그냥 한 줄 텍스트')).toBe('markdown'));
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/detect.test.ts`
Expected: FAIL (`Cannot find module '../src/detect'`).

- [ ] **Step 3: 구현**

`src/detect.ts`:
```ts
import { parseDocument } from 'yaml';
import type { Format } from './types';

export function detectFormat(text: string): Format {
  const t = text.trim();
  if (t === '') return 'markdown';

  // JSON: 대괄호/중괄호로 시작하면 (유효하지 않아도) JSON으로 다룬다 — best-effort 포맷터가 처리.
  if (/^[[{]/.test(t)) return 'json';

  // XML / HTML
  if (t.startsWith('<')) {
    if (/^<\?xml/i.test(t)) return 'xml';
    if (/<!doctype\s+html/i.test(t) || /<(html|head|body|div|span|p|a|table|ul|ol|li|img|h[1-6])[\s>/]/i.test(t)) {
      return 'html';
    }
    return isWellFormedXml(t) ? 'xml' : 'html';
  }

  // YAML: 맵/시퀀스로 파싱되고 에러가 없을 때만 (평문 한 줄은 제외)
  try {
    const doc = parseDocument(t);
    const contents = doc.contents as { items?: unknown[] } | null;
    if (doc.errors.length === 0 && contents && Array.isArray(contents.items) && contents.items.length > 0) {
      return 'yaml';
    }
  } catch {
    /* YAML 아님 */
  }

  return 'markdown';
}

function isWellFormedXml(t: string): boolean {
  const doc = new DOMParser().parseFromString(t, 'application/xml');
  return doc.getElementsByTagName('parsererror').length === 0;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/detect.test.ts`
Expected: PASS (11 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/detect.ts test/detect.test.ts
git commit -m "feat: add format auto-detection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: JSON 포맷터 + 디스패처 (format/json.ts, format/index.ts)

**Files:**
- Create: `src/format/json.ts`, `src/format/index.ts`
- Test: `test/format-json.test.ts`

**Interfaces:**
- Consumes: `FormatResult`, `Diagnostic`, `Format` (Task 2), `offsetToLineCol` (Task 2), `jsonc-parser`.
- Produces:
  - `parseJsonTolerant(text:string): { value: unknown; diagnostics: Diagnostic[] }` (Task 8이 재사용).
  - `formatJson(text:string): FormatResult`.
  - `format(text:string, fmt:Format): FormatResult` — 이번 태스크에선 json만 처리, 나머지는 `{ output:text, diagnostics:[] }` 임시 패스스루(다음 태스크에서 교체).

- [ ] **Step 1: 실패 테스트 작성**

`test/format-json.test.ts`:
```ts
import { test, expect } from 'vitest';
import { formatJson, parseJsonTolerant } from '../src/format/json';
import { format } from '../src/format/index';

test('유효 JSON은 2칸 들여쓰기로 정렬', () => {
  const r = formatJson('{"a":1,"b":[2,3]}');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
});

test('콤마 빠진 JSON은 진단 + 줄:열 보고', () => {
  const r = formatJson('{\n  "a": 1\n  "b": 2\n}');
  expect(r.diagnostics.length).toBeGreaterThan(0);
  const d = r.diagnostics[0];
  expect(d.severity).toBe('error');
  expect(typeof d.line).toBe('number');
  expect(typeof d.col).toBe('number');
});

test('parseJsonTolerant는 복구된 값을 돌려준다', () => {
  const { value, diagnostics } = parseJsonTolerant('{"a":1,}');
  expect((value as { a: number }).a).toBe(1);
  expect(Array.isArray(diagnostics)).toBe(true);
});

test('디스패처가 json을 formatJson으로 라우팅', () => {
  expect(format('{"a":1}', 'json').output).toBe('{\n  "a": 1\n}');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/format-json.test.ts`
Expected: FAIL (`Cannot find module '../src/format/json'`).

- [ ] **Step 3: 구현**

`src/format/json.ts`:
```ts
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import type { Diagnostic, FormatResult } from '../types';
import { offsetToLineCol } from '../util/offsetToLineCol';

export function parseJsonTolerant(text: string): { value: unknown; diagnostics: Diagnostic[] } {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  const diagnostics: Diagnostic[] = errors.map((e) => {
    const { line, col } = offsetToLineCol(text, e.offset);
    return {
      message: printParseErrorCode(e.error),
      offset: e.offset,
      length: e.length,
      line,
      col,
      severity: 'error',
    };
  });
  return { value, diagnostics };
}

export function formatJson(text: string): FormatResult {
  try {
    const value: unknown = JSON.parse(text);
    return { output: JSON.stringify(value, null, 2), diagnostics: [] };
  } catch {
    /* 관용 파싱으로 폴백 */
  }
  const { value, diagnostics } = parseJsonTolerant(text);
  const output = value === undefined ? undefined : JSON.stringify(value, null, 2);
  return { output, diagnostics };
}
```

`src/format/index.ts`:
```ts
import type { Format, FormatResult } from '../types';
import { formatJson } from './json';

export function format(text: string, fmt: Format): FormatResult {
  switch (fmt) {
    case 'json':
      return formatJson(text);
    default:
      // 임시 패스스루 — Task 5~7에서 교체
      return { output: text, diagnostics: [] };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/format-json.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/format/json.ts src/format/index.ts test/format-json.test.ts
git commit -m "feat: add tolerant JSON formatter and dispatcher

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: YAML 포맷터 (format/yaml.ts)

**Files:**
- Create: `src/format/yaml.ts`
- Modify: `src/format/index.ts` (yaml 라우팅 추가)
- Test: `test/format-yaml.test.ts`

**Interfaces:**
- Consumes: `Diagnostic`, `FormatResult` (Task 2), `yaml`의 `parseDocument`.
- Produces:
  - `parseYamlTolerant(text:string): { value: unknown; diagnostics: Diagnostic[] }` (Task 8 재사용).
  - `formatYaml(text:string): FormatResult`.

- [ ] **Step 1: 실패 테스트 작성**

`test/format-yaml.test.ts`:
```ts
import { test, expect } from 'vitest';
import { formatYaml, parseYamlTolerant } from '../src/format/yaml';
import { format } from '../src/format/index';

test('유효 YAML은 정규화되어 출력', () => {
  const r = formatYaml('a:    1\nb:\n  - x\n  - y');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toContain('a: 1');
  expect(r.output).toContain('- x');
});

test('잘못된 YAML은 줄 정보가 담긴 진단을 낸다', () => {
  const r = formatYaml('a: 1\n  b: 2\n c: 3');
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(typeof r.diagnostics[0].line).toBe('number');
});

test('parseYamlTolerant는 부분 값을 돌려준다', () => {
  const { value } = parseYamlTolerant('a: 1\nb: 2');
  expect((value as { a: number }).a).toBe(1);
});

test('디스패처가 yaml을 라우팅', () => {
  expect(format('a: 1', 'yaml').output).toContain('a: 1');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/format-yaml.test.ts`
Expected: FAIL (`Cannot find module '../src/format/yaml'`).

- [ ] **Step 3: 구현**

`src/format/yaml.ts`:
```ts
import { parseDocument, type YAMLError } from 'yaml';
import type { Diagnostic, FormatResult } from '../types';

function toDiagnostic(severity: 'error' | 'warning') {
  return (e: YAMLError): Diagnostic => {
    const pos = e.linePos?.[0];
    return {
      message: e.message,
      line: pos?.line,
      col: pos?.col,
      offset: e.pos?.[0],
      severity,
    };
  };
}

export function parseYamlTolerant(text: string): { value: unknown; diagnostics: Diagnostic[] } {
  const doc = parseDocument(text, { prettyErrors: true });
  const diagnostics: Diagnostic[] = [
    ...doc.errors.map(toDiagnostic('error')),
    ...doc.warnings.map(toDiagnostic('warning')),
  ];
  let value: unknown;
  try {
    value = doc.toJS();
  } catch {
    value = undefined;
  }
  return { value, diagnostics };
}

export function formatYaml(text: string): FormatResult {
  const doc = parseDocument(text, { prettyErrors: true });
  const diagnostics: Diagnostic[] = [
    ...doc.errors.map(toDiagnostic('error')),
    ...doc.warnings.map(toDiagnostic('warning')),
  ];
  let output: string | undefined;
  try {
    output = doc.contents != null ? String(doc) : undefined;
  } catch {
    output = undefined;
  }
  return { output, diagnostics };
}
```

`src/format/index.ts` 수정 — import와 case 추가:
```ts
import type { Format, FormatResult } from '../types';
import { formatJson } from './json';
import { formatYaml } from './yaml';

export function format(text: string, fmt: Format): FormatResult {
  switch (fmt) {
    case 'json':
      return formatJson(text);
    case 'yaml':
      return formatYaml(text);
    default:
      return { output: text, diagnostics: [] };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/format-yaml.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/format/yaml.ts src/format/index.ts test/format-yaml.test.ts
git commit -m "feat: add tolerant YAML formatter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: XML 포맷터 (format/xml.ts)

**Files:**
- Create: `src/format/xml.ts`
- Modify: `src/format/index.ts` (xml 라우팅 추가)
- Test: `test/format-xml.test.ts`

**Interfaces:**
- Consumes: `Diagnostic`, `FormatResult` (Task 2), `xml-formatter` 기본 export, 전역 `DOMParser`.
- Produces:
  - `xmlDiagnostics(text:string): Diagnostic[]` (Task 8 재사용).
  - `formatXml(text:string): FormatResult`.

- [ ] **Step 1: 실패 테스트 작성**

`test/format-xml.test.ts`:
```ts
import { test, expect } from 'vitest';
import { formatXml, xmlDiagnostics } from '../src/format/xml';
import { format } from '../src/format/index';

test('유효 XML은 들여쓰기되어 정렬', () => {
  const r = formatXml('<a><b>1</b><b>2</b></a>');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toContain('\n  <b>1</b>');
});

test('잘못된 XML은 진단을 내고 output은 없다', () => {
  const r = formatXml('<a><b></a>');
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(r.diagnostics[0].severity).toBe('error');
});

test('xmlDiagnostics는 유효 XML에서 빈 배열', () => {
  expect(xmlDiagnostics('<a/>')).toHaveLength(0);
});

test('디스패처가 xml을 라우팅', () => {
  expect(format('<a><b>1</b></a>', 'xml').output).toContain('<b>1</b>');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/format-xml.test.ts`
Expected: FAIL (`Cannot find module '../src/format/xml'`).

- [ ] **Step 3: 구현**

`src/format/xml.ts`:
```ts
import xmlFormat from 'xml-formatter';
import type { Diagnostic, FormatResult } from '../types';

export function xmlDiagnostics(text: string): Diagnostic[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (!err) return [];
  const message = (err.textContent ?? 'XML 파싱 오류').trim();
  const m = /line\s+(\d+)(?:[^\d]+column\s+(\d+))?/i.exec(message);
  return [
    {
      message: message.split('\n')[0],
      line: m ? Number(m[1]) : undefined,
      col: m && m[2] ? Number(m[2]) : undefined,
      severity: 'error',
    },
  ];
}

export function formatXml(text: string): FormatResult {
  const diagnostics = xmlDiagnostics(text);
  let output: string | undefined;
  try {
    output = xmlFormat(text, { collapseContent: true, indentation: '  ', lineSeparator: '\n' });
  } catch {
    output = undefined; // 잘못된 XML — 진단만 제공, 부분 트리는 tree.ts가 담당
  }
  return { output, diagnostics };
}
```

`src/format/index.ts` 수정 — import와 case 추가:
```ts
import type { Format, FormatResult } from '../types';
import { formatJson } from './json';
import { formatYaml } from './yaml';
import { formatXml } from './xml';

export function format(text: string, fmt: Format): FormatResult {
  switch (fmt) {
    case 'json':
      return formatJson(text);
    case 'yaml':
      return formatYaml(text);
    case 'xml':
      return formatXml(text);
    default:
      return { output: text, diagnostics: [] };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/format-xml.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/format/xml.ts src/format/index.ts test/format-xml.test.ts
git commit -m "feat: add XML formatter with parse diagnostics

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: HTML 포맷터 + Markdown 패스스루 (format/html.ts)

**Files:**
- Create: `src/format/html.ts`
- Modify: `src/format/index.ts` (html 라우팅 + markdown 명시적 패스스루)
- Test: `test/format-html.test.ts`

**Interfaces:**
- Consumes: `FormatResult` (Task 2), `js-beautify`의 named export `html`.
- Produces: `formatHtml(text:string): FormatResult` (HTML은 항상 성공, 진단 없음). 디스패처가 5개 포맷 전부를 다룬다 (markdown은 원문 반환).

- [ ] **Step 1: 실패 테스트 작성**

`test/format-html.test.ts`:
```ts
import { test, expect } from 'vitest';
import { formatHtml } from '../src/format/html';
import { format } from '../src/format/index';

test('지저분한 HTML을 들여쓰기', () => {
  const r = formatHtml('<div><p>hi</p></div>');
  expect(r.diagnostics).toHaveLength(0);
  expect(r.output).toContain('\n  <p>hi</p>');
});

test('HTML은 어떤 입력도 진단 없이 정렬', () => {
  const r = formatHtml('<div><p>안 닫힘');
  expect(r.diagnostics).toHaveLength(0);
  expect(typeof r.output).toBe('string');
});

test('markdown 디스패치는 원문을 그대로 반환', () => {
  const r = format('# 제목', 'markdown');
  expect(r.output).toBe('# 제목');
  expect(r.diagnostics).toHaveLength(0);
});

test('디스패처가 html을 라우팅', () => {
  expect(format('<div><p>hi</p></div>', 'html').output).toContain('<p>hi</p>');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/format-html.test.ts`
Expected: FAIL (`Cannot find module '../src/format/html'`).

- [ ] **Step 3: 구현**

`src/format/html.ts`:
```ts
import beautify from 'js-beautify';
import type { FormatResult } from '../types';

export function formatHtml(text: string): FormatResult {
  const output = beautify.html(text, {
    indent_size: 2,
    wrap_line_length: 0,
    preserve_newlines: true,
    end_with_newline: false,
  });
  return { output, diagnostics: [] };
}
```

`src/format/index.ts` — 최종형(5개 포맷 전부 명시):
```ts
import type { Format, FormatResult } from '../types';
import { formatJson } from './json';
import { formatYaml } from './yaml';
import { formatXml } from './xml';
import { formatHtml } from './html';

export function format(text: string, fmt: Format): FormatResult {
  switch (fmt) {
    case 'json':
      return formatJson(text);
    case 'yaml':
      return formatYaml(text);
    case 'xml':
      return formatXml(text);
    case 'html':
      return formatHtml(text);
    case 'markdown':
      return { output: text, diagnostics: [] }; // v1: prettify 미지원
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/format-html.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: 전체 포맷 테스트 회귀 확인**

Run: `npx vitest run`
Expected: 지금까지의 모든 테스트 PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/format/html.ts src/format/index.ts test/format-html.test.ts
git commit -m "feat: add HTML formatter and finalize format dispatcher

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 트리 빌더 + 렌더러 (tree.ts)

**Files:**
- Create: `src/tree.ts`
- Test: `test/tree.test.ts`

**Interfaces:**
- Consumes: `Format`, `TreeNode`, `TreeResult`, `Diagnostic` (Task 2), `parseJsonTolerant` (Task 4), `parseYamlTolerant` (Task 5), `xmlDiagnostics` (Task 6), 전역 `DOMParser`/`Node`.
- Produces:
  - `buildTree(text:string, fmt:Format): TreeResult`.
  - `renderTree(root:TreeNode): HTMLElement` — 접이식 DOM(`.tree-node`, `.tree-toggle`, `.tree-children`).

- [ ] **Step 1: 실패 테스트 작성**

`test/tree.test.ts`:
```ts
import { test, expect } from 'vitest';
import { buildTree, renderTree } from '../src/tree';

test('JSON 객체 → object 노드 + 자식', () => {
  const r = buildTree('{"a":1,"b":[2,3]}', 'json');
  expect(r.root?.type).toBe('object');
  expect(r.root?.children).toHaveLength(2);
  const b = r.root?.children?.find((c) => c.key === 'b');
  expect(b?.type).toBe('array');
  expect(b?.children).toHaveLength(2);
});

test('YAML 맵 → object 노드', () => {
  const r = buildTree('a: 1\nb: 2', 'yaml');
  expect(r.root?.type).toBe('object');
  expect(r.root?.children?.map((c) => c.key)).toEqual(['a', 'b']);
});

test('XML → element 노드(속성은 @접두 스칼라)', () => {
  const r = buildTree('<a id="x"><b>1</b></a>', 'xml');
  expect(r.root?.type).toBe('element');
  expect(r.root?.key).toBe('a');
  expect(r.root?.children?.some((c) => c.key === '@id')).toBe(true);
});

test('잘못된 XML → 진단 + 부분 트리(partial)', () => {
  const r = buildTree('<a><b></a>', 'xml');
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(r.root?.partial).toBe(true);
});

test('복구된 JSON 트리는 partial 표시', () => {
  const r = buildTree('{"a":1 "b":2}', 'json'); // 콤마 누락 → 복구
  expect(r.diagnostics.length).toBeGreaterThan(0);
  expect(r.root?.partial).toBe(true);
});

test('Markdown은 트리 대신 경고', () => {
  const r = buildTree('# x', 'markdown');
  expect(r.root).toBeUndefined();
  expect(r.diagnostics[0].severity).toBe('warning');
});

test('renderTree는 접이식 DOM을 만든다', () => {
  const r = buildTree('{"a":1}', 'json');
  const el = renderTree(r.root!);
  expect(el.querySelectorAll('.tree-node').length).toBeGreaterThan(0);
  const toggle = el.querySelector('.tree-toggle') as HTMLButtonElement;
  const children = el.querySelector('.tree-children') as HTMLElement;
  expect(children.style.display).not.toBe('none');
  toggle.click();
  expect(children.style.display).toBe('none');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/tree.test.ts`
Expected: FAIL (`Cannot find module '../src/tree'`).

- [ ] **Step 3: 구현**

`src/tree.ts`:
```ts
import type { Diagnostic, Format, TreeNode, TreeResult } from './types';
import { parseJsonTolerant } from './format/json';
import { parseYamlTolerant } from './format/yaml';
import { xmlDiagnostics } from './format/xml';

export function buildTree(text: string, fmt: Format): TreeResult {
  switch (fmt) {
    case 'json':
      return fromValue(parseJsonTolerant(text));
    case 'yaml':
      return fromValue(parseYamlTolerant(text));
    case 'xml':
      return domTree(text, 'application/xml');
    case 'html':
      return domTree(text, 'text/html');
    case 'markdown':
      return { diagnostics: [{ message: 'Markdown은 트리뷰 대신 미리보기를 사용합니다', severity: 'warning' }] };
  }
}

function fromValue(parsed: { value: unknown; diagnostics: Diagnostic[] }): TreeResult {
  if (parsed.value === undefined) return { diagnostics: parsed.diagnostics };
  const root = valueToNode(parsed.value);
  if (parsed.diagnostics.length > 0) root.partial = true; // 복구된 트리는 partial 표시
  return { root, diagnostics: parsed.diagnostics };
}

function valueToNode(value: unknown, key?: string): TreeNode {
  if (Array.isArray(value)) {
    return { key, type: 'array', children: value.map((v, i) => valueToNode(v, String(i))) };
  }
  if (value !== null && typeof value === 'object') {
    return {
      key,
      type: 'object',
      children: Object.entries(value as Record<string, unknown>).map(([k, v]) => valueToNode(v, k)),
    };
  }
  return { key, type: 'scalar', value: value === null ? 'null' : String(value) };
}

function domTree(text: string, mime: 'application/xml' | 'text/html'): TreeResult {
  const doc = new DOMParser().parseFromString(text, mime);
  if (mime === 'application/xml') {
    const diagnostics = xmlDiagnostics(text);
    if (diagnostics.length > 0) {
      // 엄격 파싱 실패 → 관용(html) 파싱으로 부분 트리
      const lenient = new DOMParser().parseFromString(text, 'text/html');
      const body = lenient.body;
      const root = body ? elementToNode(body) : undefined;
      if (root) root.partial = true;
      return { root, diagnostics };
    }
    return { root: elementToNode(doc.documentElement), diagnostics: [] };
  }
  const body = doc.body;
  return { root: body ? elementToNode(body) : undefined, diagnostics: [] };
}

function elementToNode(el: Element): TreeNode {
  const children: TreeNode[] = [];
  for (const attr of Array.from(el.attributes)) {
    children.push({ key: `@${attr.name}`, type: 'scalar', value: attr.value });
  }
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      children.push(elementToNode(child as Element));
    } else if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent?.trim();
      if (t) children.push({ type: 'scalar', value: t });
    }
  }
  return {
    key: el.tagName.toLowerCase(),
    type: 'element',
    children: children.length ? children : undefined,
  };
}

export function renderTree(root: TreeNode): HTMLElement {
  const container = document.createElement('div');
  container.className = 'tree';
  container.appendChild(renderNode(root));
  return container;
}

function renderNode(node: TreeNode): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tree-node' + (node.partial ? ' partial' : '');
  const keyPart = node.key !== undefined ? `${node.key}: ` : '';
  const label = document.createElement('span');
  label.className = 'tree-label';

  if (node.children && node.children.length) {
    const toggle = document.createElement('button');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▾';
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    node.children.forEach((c) => childrenEl.appendChild(renderNode(c)));
    toggle.addEventListener('click', () => {
      const hidden = childrenEl.style.display === 'none';
      childrenEl.style.display = hidden ? '' : 'none';
      toggle.textContent = hidden ? '▾' : '▸';
    });
    label.textContent = `${keyPart}${typeLabel(node)}`;
    el.append(toggle, label, childrenEl);
  } else {
    label.textContent = `${keyPart}${node.value ?? typeLabel(node)}`;
    el.append(label);
  }
  return el;
}

function typeLabel(node: TreeNode): string {
  switch (node.type) {
    case 'array':
      return `[${node.children?.length ?? 0}]`;
    case 'object':
      return `{${node.children?.length ?? 0}}`;
    case 'element':
      return `<${node.key ?? ''}>`;
    default:
      return node.value ?? '';
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/tree.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/tree.ts test/tree.test.ts
git commit -m "feat: add tree builder and collapsible renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Markdown 미리보기 + 정화 (preview.ts)

**Files:**
- Create: `src/preview.ts`
- Test: `test/preview.test.ts`

**Interfaces:**
- Consumes: `PreviewResult` (Task 2), `marked`, `dompurify`.
- Produces: `renderMarkdown(text:string): PreviewResult` — `html`은 정화 완료된 안전 HTML.

- [ ] **Step 1: 실패 테스트 작성**

`test/preview.test.ts`:
```ts
import { test, expect } from 'vitest';
import { renderMarkdown } from '../src/preview';

test('제목을 <h1>로 렌더', () => {
  expect(renderMarkdown('# 제목').html).toContain('<h1');
});

test('목록을 <ul><li>로 렌더', () => {
  const html = renderMarkdown('- a\n- b').html;
  expect(html).toContain('<ul>');
  expect(html).toContain('<li>a</li>');
});

test('<script>는 정화로 제거', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n# ok').html;
  expect(html).not.toContain('<script>');
});

test('onerror 핸들러 제거', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>').html;
  expect(html.toLowerCase()).not.toContain('onerror');
});

test('javascript: 링크 제거', () => {
  const html = renderMarkdown('[클릭](javascript:alert(1))').html;
  expect(html.toLowerCase()).not.toContain('javascript:');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/preview.test.ts`
Expected: FAIL (`Cannot find module '../src/preview'`).

- [ ] **Step 3: 구현**

`src/preview.ts`:
```ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { PreviewResult } from './types';

export function renderMarkdown(text: string): PreviewResult {
  const raw = marked.parse(text, { async: false }) as string;
  const html = DOMPurify.sanitize(raw);
  return { html, diagnostics: [] };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/preview.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/preview.ts test/preview.test.ts
git commit -m "feat: add sanitized markdown preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: URL 상태 인코딩 (urlState.ts)

**Files:**
- Create: `src/urlState.ts`
- Test: `test/urlState.test.ts`

**Interfaces:**
- Consumes: `State`, `Format` (Task 2), `lz-string`.
- Produces:
  - `encode(state:State): string` — 압축된 URL-safe 토큰(앞에 `#` 없음).
  - `decode(hash:string): State|null` — `#` 접두 허용, 손상/구버전이면 `null`.

- [ ] **Step 1: 실패 테스트 작성**

`test/urlState.test.ts`:
```ts
import { test, expect } from 'vitest';
import { compressToEncodedURIComponent } from 'lz-string';
import { encode, decode } from '../src/urlState';
import type { State } from '../src/types';

test('인코드→디코드 라운드트립(유니코드 포함)', () => {
  const s: State = { v: 1, f: 'json', d: '{"한글":"😀"}' };
  const round = decode(encode(s));
  expect(round).toEqual(s);
});

test('# 접두가 붙은 해시도 디코드', () => {
  const s: State = { v: 1, f: 'yaml', d: 'a: 1' };
  expect(decode('#' + encode(s))).toEqual(s);
});

test('손상된 토큰은 null', () => {
  expect(decode('#%%%not-valid%%%')).toBeNull();
});

test('빈 해시는 null', () => {
  expect(decode('')).toBeNull();
  expect(decode('#')).toBeNull();
});

test('알 수 없는 포맷은 null', () => {
  // 허용 목록 밖의 f를 담은 정상 압축 토큰 → decode가 거부해야 함
  const badToken = compressToEncodedURIComponent(JSON.stringify({ v: 1, f: 'toml', d: 'x' }));
  expect(decode('#' + badToken)).toBeNull();
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/urlState.test.ts`
Expected: FAIL (`Cannot find module '../src/urlState'`).

- [ ] **Step 3: 구현**

`src/urlState.ts`:
```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/urlState.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: 커밋**

```bash
git add src/urlState.ts test/urlState.test.ts
git commit -m "feat: add URL fragment state encode/decode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: CodeMirror 에디터 래퍼 (editor.ts)

**Files:**
- Create: `src/editor.ts`
- Test: `test/editor.test.ts`

**Interfaces:**
- Consumes: `Format`, `Diagnostic` (Task 2), `codemirror`, `@codemirror/state`, `@codemirror/lint`, `@codemirror/lang-*`.
- Produces:
  - `toCmDiagnostics(text:string, diags:Diagnostic[]): {from:number;to:number;severity:'error'|'warning';message:string}[]` (순수 함수, 단위 테스트 대상).
  - `createEditor(parent:HTMLElement, initial:{text:string; fmt:Format}, onChange:()=>void): Editor` — `Editor`는 `{ getValue():string; setValue(s:string):void; setLanguage(fmt:Format):void; setDiagnostics(d:Diagnostic[]):void }`.

- [ ] **Step 1: 실패 테스트 작성**

`test/editor.test.ts`:
```ts
import { test, expect } from 'vitest';
import { toCmDiagnostics } from '../src/editor';

test('offset/length를 from/to로 매핑', () => {
  const out = toCmDiagnostics('hello world', [
    { message: 'bad', offset: 6, length: 5, severity: 'error' },
  ]);
  expect(out[0]).toMatchObject({ from: 6, to: 11, severity: 'error', message: 'bad' });
});

test('offset 없는 진단은 인라인에서 제외(상태줄 메시지로만 표시)', () => {
  const out = toCmDiagnostics('abc', [{ message: 'x', severity: 'warning' }]);
  expect(out).toHaveLength(0);
});

test('to는 텍스트 길이로 클램프', () => {
  const out = toCmDiagnostics('ab', [{ message: 'x', offset: 1, length: 99, severity: 'error' }]);
  expect(out[0].to).toBe(2);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/editor.test.ts`
Expected: FAIL (`Cannot find module '../src/editor'`).

- [ ] **Step 3: 구현**

`src/editor.ts`:
```ts
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { linter, lintGutter, forceLinting, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';
import type { Diagnostic, Format } from './types';

const langFor: Record<Format, () => ReturnType<typeof json>> = {
  json,
  html,
  xml,
  yaml,
  markdown,
};

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
  setValue(s: string): void;
  setLanguage(fmt: Format): void;
  setDiagnostics(d: Diagnostic[]): void;
}

export function createEditor(
  parent: HTMLElement,
  initial: { text: string; fmt: Format },
  onChange: () => void,
): Editor {
  const language = new Compartment();
  let diagnostics: Diagnostic[] = [];

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initial.text,
      extensions: [
        basicSetup,
        language.of(langFor[initial.fmt]()),
        lintGutter(),
        linter((v) => toCmDiagnostics(v.state.doc.toString(), diagnostics)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange();
        }),
      ],
    }),
  });

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (s) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: s } }),
    setLanguage: (fmt) => view.dispatch({ effects: language.reconfigure(langFor[fmt]()) }),
    setDiagnostics: (d) => {
      diagnostics = d;
      forceLinting(view);
    },
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/editor.test.ts`
Expected: PASS (3 passed). (CodeMirror 결선은 Task 13 e2e에서 검증.)

- [ ] **Step 5: 커밋**

```bash
git add src/editor.ts test/editor.test.ts
git commit -m "feat: add CodeMirror editor wrapper with diagnostics

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: UI 결선 + 부트스트랩 (ui.ts, main.ts, debounce)

**Files:**
- Create: `src/util/debounce.ts`, `src/ui.ts`
- Modify: `src/main.ts` (전체 결선), `src/styles.css` (툴바/패널/토스트 스타일)
- Test: `test/ui.test.ts`, `test/debounce.test.ts`

**Interfaces:**
- Consumes: 전 모듈 — `detectFormat`(T3), `format`(T4-7), `buildTree`/`renderTree`(T8), `renderMarkdown`(T9), `encode`/`decode`(T10), `createEditor`(T11), `Format`/`Diagnostic`(T2).
- Produces:
  - `debounce<T extends unknown[]>(fn:(...a:T)=>void, ms:number): (...a:T)=>void`.
  - `canFormat(fmt:Format): boolean` — markdown이면 false.
  - `viewLabel(fmt:Format): string` — markdown이면 `'미리보기'`, 아니면 `'트리'`.
  - `formatDiagnosticLine(diags:Diagnostic[]): string` — 상태줄 요약 텍스트.
  - `mountApp(root:{ toolbar:HTMLElement; editorHost:HTMLElement; panel:HTMLElement; status:HTMLElement; toast:HTMLElement }): void` — 앱 전체를 결선(main.ts가 호출).

- [ ] **Step 1: 실패 테스트 작성 (순수 헬퍼)**

`test/debounce.test.ts`:
```ts
import { test, expect, vi } from 'vitest';
import { debounce } from '../src/util/debounce';

test('마지막 호출만 한 번 실행', async () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  const d = debounce(fn, 100);
  d(1);
  d(2);
  d(3);
  expect(fn).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(fn).toHaveBeenCalledWith(3);
  vi.useRealTimers();
});
```

`test/ui.test.ts`:
```ts
import { test, expect } from 'vitest';
import { canFormat, viewLabel, formatDiagnosticLine } from '../src/ui';

test('markdown은 정렬 불가, 나머지는 가능', () => {
  expect(canFormat('markdown')).toBe(false);
  expect(canFormat('json')).toBe(true);
});

test('뷰 라벨은 포맷에 따라 달라진다', () => {
  expect(viewLabel('markdown')).toBe('미리보기');
  expect(viewLabel('xml')).toBe('트리');
});

test('진단 요약은 첫 에러의 줄:열을 보여준다', () => {
  const line = formatDiagnosticLine([
    { message: '콤마 누락', line: 3, col: 5, severity: 'error' },
  ]);
  expect(line).toContain('3');
  expect(line).toContain('5');
  expect(line).toContain('콤마 누락');
});

test('진단이 없으면 OK 표시', () => {
  expect(formatDiagnosticLine([])).toMatch(/문제\s*없음|OK/);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/ui.test.ts test/debounce.test.ts`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 헬퍼 + 결선 구현**

`src/util/debounce.ts`:
```ts
export function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
```

`src/ui.ts`:
```ts
import type { Diagnostic, Format } from './types';
import { detectFormat } from './detect';
import { format } from './format/index';
import { buildTree, renderTree } from './tree';
import { renderMarkdown } from './preview';
import { encode, decode } from './urlState';
import { createEditor } from './editor';
import { debounce } from './util/debounce';

const FORMATS: Format[] = ['json', 'html', 'xml', 'yaml', 'markdown'];
const URL_WARN_LEN = 10_000;

export function canFormat(fmt: Format): boolean {
  return fmt !== 'markdown';
}

export function viewLabel(fmt: Format): string {
  return fmt === 'markdown' ? '미리보기' : '트리';
}

export function formatDiagnosticLine(diags: Diagnostic[]): string {
  if (diags.length === 0) return '문제 없음';
  const first = diags.find((d) => d.severity === 'error') ?? diags[0];
  const loc = first.line ? `줄 ${first.line}, 열 ${first.col ?? 1}: ` : '';
  const extra = diags.length > 1 ? ` (외 ${diags.length - 1}건)` : '';
  return `${loc}${first.message}${extra}`;
}

export interface AppRoot {
  toolbar: HTMLElement;
  editorHost: HTMLElement;
  panel: HTMLElement;
  status: HTMLElement;
  toast: HTMLElement;
}

export function mountApp(root: AppRoot): void {
  const decoded = decode(location.hash);
  const initial = decoded ?? { v: 1 as const, f: 'json' as Format, d: '' };
  let currentFormat: Format = initial.f;
  // 복원된 해시의 포맷은 명시적 선택으로 간주 → 자동 감지가 덮어쓰지 않음(스펙 §6)
  let manual = decoded !== null;

  // 툴바 구성
  const select = document.createElement('select');
  select.id = 'format-select';
  for (const f of FORMATS) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f.toUpperCase();
    if (f === currentFormat) opt.selected = true;
    select.appendChild(opt);
  }
  const formatBtn = button('정렬');
  const viewBtn = button(viewLabel(currentFormat));
  const shareBtn = button('공유');
  root.toolbar.append(select, formatBtn, viewBtn, shareBtn);

  const editor = createEditor(root.editorHost, { text: initial.d, fmt: currentFormat }, onChange);

  function showToast(msg: string): void {
    root.toast.textContent = msg;
    root.toast.hidden = false;
    setTimeout(() => (root.toast.hidden = true), 2000);
  }

  function applyDiagnostics(diags: Diagnostic[]): void {
    editor.setDiagnostics(diags);
    root.status.textContent = formatDiagnosticLine(diags);
  }

  function refreshToolbarForFormat(): void {
    formatBtn.disabled = !canFormat(currentFormat);
    viewBtn.textContent = viewLabel(currentFormat);
    select.value = currentFormat;
  }

  const persist = debounce(() => {
    // replaceState로 현재 히스토리 항목만 갱신 → 타이핑 중 뒤로가기 히스토리 오염 방지(스펙 §4.2)
    history.replaceState(null, '', '#' + encode({ v: 1, f: currentFormat, d: editor.getValue() }));
  }, 400);

  const autodetect = debounce(() => {
    if (manual) return;
    const guess = detectFormat(editor.getValue());
    if (guess !== currentFormat) {
      currentFormat = guess;
      editor.setLanguage(guess);
      refreshToolbarForFormat();
    }
  }, 300);

  function onChange(): void {
    autodetect();
    persist();
  }

  select.addEventListener('change', () => {
    manual = true;
    currentFormat = select.value as Format;
    editor.setLanguage(currentFormat);
    refreshToolbarForFormat();
    persist();
  });

  formatBtn.addEventListener('click', () => {
    const before = format(editor.getValue(), currentFormat);
    if (before.output !== undefined) {
      // 안전 정책: 정렬 결과가 새 에러를 만들면 보류
      const after = format(before.output, currentFormat);
      if (after.diagnostics.length <= before.diagnostics.length) {
        editor.setValue(before.output);
        applyDiagnostics(after.diagnostics); // 교체된 새 내용에 맞는 진단(오프셋 일치)
      } else {
        showToast('정렬을 보류했습니다(원문 보존)');
        applyDiagnostics(before.diagnostics);
      }
    } else {
      applyDiagnostics(before.diagnostics);
    }
    persist();
  });

  viewBtn.addEventListener('click', () => {
    if (!root.panel.hidden) {
      root.panel.hidden = true; // 이미 열려 있으면 닫기(토글, 스펙 §4.4)
      return;
    }
    root.panel.innerHTML = '';
    if (currentFormat === 'markdown') {
      const { html } = renderMarkdown(editor.getValue());
      const view = document.createElement('div');
      view.className = 'markdown-body';
      view.innerHTML = html; // 정화 완료된 HTML
      root.panel.appendChild(view);
    } else {
      const { root: treeRoot, diagnostics } = buildTree(editor.getValue(), currentFormat);
      if (treeRoot) root.panel.appendChild(renderTree(treeRoot));
      applyDiagnostics(diagnostics);
    }
    root.panel.hidden = false;
  });

  shareBtn.addEventListener('click', async () => {
    // 디바운스 대기 중일 수 있으므로 해시를 동기적으로 먼저 최신화한 뒤 복사(스펙 §4.5)
    history.replaceState(null, '', '#' + encode({ v: 1, f: currentFormat, d: editor.getValue() }));
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast(url.length > URL_WARN_LEN ? '복사됨 — 링크가 깁니다(일부 앱에서 잘릴 수 있음)' : '링크 복사됨');
    } catch {
      root.status.textContent = url; // 폴백: 주소를 상태줄에 노출
    }
  });

  refreshToolbarForFormat();
  if (initial.d) applyDiagnostics(format(initial.d, currentFormat).diagnostics);
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.type = 'button';
  return b;
}
```

`src/main.ts` (전체 교체):
```ts
import './styles.css';
import { mountApp } from './ui';

const toolbar = document.getElementById('toolbar');
const editorHost = document.getElementById('editor');
const panel = document.getElementById('panel');
const status = document.getElementById('status');
const toast = document.getElementById('toast');

if (toolbar && editorHost && panel && status && toast) {
  mountApp({ toolbar, editorHost, panel, status, toast });
}
```

`src/styles.css` (아래 내용을 파일 끝에 추가):
```css
#toolbar { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid #8884; align-items: center; }
#toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
#panel { max-height: 40vh; overflow: auto; padding: 8px; border-top: 1px solid #8884; }
.tree-children { margin-left: 16px; }
.tree-toggle { background: none; border: none; cursor: pointer; padding: 0 4px; }
.tree-node.partial > .tree-label { opacity: 0.6; }
.markdown-body { line-height: 1.6; }
#toast { position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
  background: #222; color: #fff; padding: 6px 12px; border-radius: 4px; font-size: 13px; }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/ui.test.ts test/debounce.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: 전체 유닛 회귀 + 타입체크 + 빌드 확인**

Run: `npm test && npm run build && ls dist`
Expected: 모든 유닛 PASS, 타입에러 없음, `dist/index.html` 단일 파일.

- [ ] **Step 6: 커밋**

```bash
git add src/util/debounce.ts src/ui.ts src/main.ts src/styles.css test/ui.test.ts test/debounce.test.ts
git commit -m "feat: wire toolbar, editor, views, and URL persistence

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: E2E 스모크 (Playwright)

**Files:**
- Create: `playwright.config.ts`, `test/e2e.spec.ts`
- Test: `test/e2e.spec.ts`

**Interfaces:**
- Consumes: 빌드 산출물 `dist/index.html` (vite preview로 서빙).
- Produces: (없음 — 검증 전용)

- [ ] **Step 1: Playwright 설정 + 실패 테스트 작성**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4173' },
});
```

`test/e2e.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('정렬 → 트리 → 공유 → 새로고침 복원', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('{"a":1,"b":[2,3]}');

  await page.getByRole('button', { name: '정렬' }).click();
  await expect(page.locator('.cm-content')).toContainText('"a": 1');

  await page.getByRole('button', { name: '트리' }).click();
  await expect(page.locator('#panel .tree-node').first()).toBeVisible();

  await page.getByRole('button', { name: '공유' }).click();
  await expect.poll(() => page.url()).toContain('#');

  const shared = page.url();
  await page.goto(shared);
  await expect(page.locator('.cm-content')).toContainText('"a"');
});

test('깨진 JSON은 상태줄에 줄:열 에러를 표시', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.type('{\n"a":1\n"b":2\n}');
  // 정렬은 복구 후 유효해지므로, 깨진 입력의 진단은 트리(뷰) 경로로 확인
  await page.getByRole('button', { name: '트리' }).click();
  await expect(page.locator('#status')).toContainText('줄');
});

test('Markdown 미리보기 렌더', async ({ page }) => {
  await page.goto('/');
  await page.locator('#format-select').selectOption('markdown');
  await page.locator('.cm-content').click();
  await page.keyboard.type('# 안녕');
  await page.getByRole('button', { name: '미리보기' }).click();
  await expect(page.locator('#panel .markdown-body h1')).toHaveText('안녕');
});
```

- [ ] **Step 2: 브라우저 설치 후 테스트 실패/통과 확인**

Run: `npx playwright install chromium && npm run e2e`
Expected: 처음엔 셀렉터/타이밍으로 실패할 수 있음 → 메시지를 보고 위 스펙대로 통과시킨다. 최종 Expected: 3 passed.

- [ ] **Step 3: 커밋**

```bash
git add playwright.config.ts test/e2e.spec.ts
git commit -m "test: add Playwright end-to-end smoke tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: 배포 설정 + README

**Files:**
- Create: `README.md`, `public/_headers`
- Test: 수동 검증(빌드 + 로컬 프리뷰)

**Interfaces:**
- Consumes: `npm run build`.
- Produces: Cloudflare Pages 배포 문서 + 캐싱 헤더.

- [ ] **Step 1: `_headers` 작성 (Cloudflare Pages 캐싱)**

`public/_headers`:
```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
```

- [ ] **Step 2: README 작성**

`README.md`:
```markdown
# simpleParser

브라우저에서 동작하는 다포맷 포맷터/뷰어. JSON · HTML · XML · YAML 정렬·트리뷰,
Markdown 미리보기를 제공하고, 문서 상태를 URL에 담아 공유합니다. 백엔드 없음.

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm test         # 유닛 테스트 (Vitest)
npm run e2e      # E2E 스모크 (Playwright)
npm run build    # dist/index.html (단일 파일) 생성
npm run preview  # 빌드 결과 미리보기
```

## 동작

- 입력을 붙여넣으면 포맷을 자동 감지(드롭다운으로 수동 변경 가능).
- `정렬`: 제자리 prettify. 문법이 틀려도 가능한 한 정렬하고, 문제 위치를 줄:열로 표시.
- `트리`(JSON/HTML/XML/YAML) / `미리보기`(Markdown): 구조/렌더 보기.
- `공유`: 현재 상태가 담긴 URL을 복사. 데이터는 URL 프래그먼트(`#`)에만 있어 서버로 전송되지 않음.

## 배포 (Cloudflare Pages)

1. Cloudflare Pages에서 GitHub 저장소 `gum798/simpleParser` 연결.
2. 빌드 설정:
   - Build command: `npm run build`
   - Build output directory: `dist`
3. `main` 브랜치 푸시 시 자동 배포.

또는 수동 배포:

```bash
npm run build
npx wrangler pages deploy dist
```
```

- [ ] **Step 3: 빌드/프리뷰 수동 검증**

Run: `npm run build && npm run preview`
Expected: 브라우저에서 `http://localhost:4173` 접속 → 붙여넣기/정렬/트리/미리보기/공유가 동작.

- [ ] **Step 4: 커밋**

```bash
git add README.md public/_headers
git commit -m "docs: add README and Cloudflare Pages headers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검 결과)

**1. 스펙 커버리지**
- 다포맷 포맷터/뷰어(§1) → Task 4~9.
- URL 프래그먼트 저장(§5) → Task 10, 결선 Task 12.
- best-effort 파싱 + 줄:열 진단(§7) → Task 4(JSON)·5(YAML)·6(XML)·8(부분 트리), 표시 Task 11·12.
- Markdown 정화 미리보기(§1·§8) → Task 9, 결선 Task 12.
- 단일 HTML 빌드(§10) → Task 1(설정)·12(빌드 확인)·13(프리뷰).
- 자동 감지(§6) → Task 3.
- 테스트 전략(§9) → Task 2~13 각 유닛 + Task 13 e2e.
- 배포(§10) → Task 14.
- 모든 스펙 요구에 대응 태스크 존재 — 누락 없음.

**2. Placeholder 스캔:** "TBD/이후구현/적절히 처리" 류 없음. 모든 코드 단계에 실제 코드 포함.

**3. 타입 일관성:** `parseJsonTolerant`(T4)·`parseYamlTolerant`(T5)·`xmlDiagnostics`(T6)가 T8에서 동일 시그니처로 재사용됨. `format`(T4~7), `buildTree`/`renderTree`(T8), `renderMarkdown`(T9), `encode`/`decode`(T10), `createEditor`/`toCmDiagnostics`(T11), `canFormat`/`viewLabel`/`formatDiagnosticLine`/`mountApp`(T12) 모두 Interfaces 블록과 호출부가 일치. `Format` 5종이 detect·urlState·ui에서 동일하게 사용됨.

## 적대적 검증 (Adversarial verification)

작성 후 독립 에이전트 3종(일관성 비평 · 라이브러리 API 검증 · 테스트 유효성)으로 교차 검증했다.
- **라이브러리 API**: marked·js-beautify·yaml(eemeli)·jsonc-parser·@codemirror/lint·@codemirror/lang-yaml·dompurify·lz-string 사용법이 모두 핀 고정 버전의 실제 API와 일치함을 확인(문제 0건).
- **반영된 수정 9건**:
  1. (blocker) T7 HTML 테스트 기대값 4칸 → 2칸(`indent_size: 2`와 일치).
  2. (major) T12 `공유`: 디바운스 경합 방지 위해 클릭 시 `history.replaceState`로 해시를 동기 최신화 후 복사.
  3. (major) T12 `정렬`: 교체 후 `after.diagnostics`(새 내용 기준)로 표시 — 인라인 밑줄 오프셋 어긋남 제거. 이에 맞춰 e2e #2를 `트리` 경로로 변경(복구되면 유효해지므로).
  4. (major) T10 urlState 테스트: 무의미한 no-op 테스트를 허용목록 밖 포맷(`toml`) 토큰 거부 검증으로 교체.
  5. (minor) T8 `fromValue`: JSON/YAML도 복구 시 `root.partial = true` 표시 + 회귀 테스트 추가.
  6. (minor) T12 init: 복원된 해시 포맷을 `manual`로 고정해 자동 감지가 덮어쓰지 않게 함.
  7. (minor) T12 뷰 버튼을 실제 토글로(열림 상태면 닫기).
  8. (minor) T11 `toCmDiagnostics`: offset 없는 진단(XML)은 인라인에서 제외(상태줄 메시지로만) + 테스트 갱신.
  9. (minor) T12 자동저장 `persist`: `location.hash=` 대신 `history.replaceState`로 히스토리 오염 방지.
