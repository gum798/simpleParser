import type { Diagnostic, Format, State, TreeNode } from './types';
import { detectFormat } from './detect';
import { approxFind } from './treeJump';
import { format, formatKeepOriginal } from './format/index';
import { buildTree, renderTree, maxDepth, highlightText } from './tree';
import { renderMarkdown } from './preview';
import { encode, decode } from './urlState';
import { createEditor } from './editor';
import { debounce } from './util/debounce';
import { mountRulesPanel, createRule } from './rulesPanel';
import { loadRules, saveRules } from './highlight/store';
import { compileRules } from './highlight/matcher';
import { mountContextHighlight, truncateLabel } from './contextHighlight';
import { regexEscape } from './util/regexEscape';
import { loadTheme, saveTheme, applyTheme } from './theme';
import { openThemePanel } from './themePanel';

const FORMATS: Format[] = ['json', 'html', 'xml', 'yaml', 'markdown'];
const URL_WARN_LEN = 10_000;
// 붙여넣기 시 자동 정렬은 이 길이 이하의 입력만 대상으로 한다(메인 스레드 부하 억제, 스펙 §자동파싱).
export const AUTO_FORMAT_MAX = 256_000;
// 우클릭 강조로 만들 규칙의 선택 텍스트 상한 — 지나치게 길면 URL/매칭 비용만 커진다.
const MAX_HIGHLIGHT_SELECTION = 1_000;

export function canFormat(fmt: Format): boolean {
  return fmt !== 'markdown';
}

/** 붙여넣기 자동 정렬을 수행할지 결정한다: 정렬 가능 포맷 + 비어있지 않은 작은 입력만(저부하). */
export function shouldAutoFormat(text: string, fmt: Format): boolean {
  return text.trim() !== '' && text.length <= AUTO_FORMAT_MAX && canFormat(fmt);
}

/** 툴바 뷰 버튼 라벨 — 버튼이 다시 열 뷰(트리/텍스트/미리보기)와 항상 일치시킨다. */
export function viewLabel(fmt: Format, view: 'tree' | 'text' = 'tree'): string {
  if (fmt === 'markdown') return '미리보기';
  return view === 'text' ? '텍스트' : '트리';
}

export function formatDiagnosticLine(diags: Diagnostic[]): string {
  if (diags.length === 0) return '✓ 문제 없음';
  const first = diags.find((d) => d.severity === 'error') ?? diags[0];
  const loc = first.line ? `줄 ${first.line}, 열 ${first.col ?? 1}: ` : '';
  const extra = diags.length > 1 ? ` (외 ${diags.length - 1}건)` : '';
  return `⚠ ${loc}${first.message}${extra}`;
}

export function saveMessage(copied: boolean): string {
  return copied
    ? '💾 저장됨! 링크가 클립보드에 복사되었습니다.'
    : '💾 저장됨! 아래 링크를 직접 복사하세요 (자동 복사가 막혔습니다).';
}

export interface AppRoot {
  header: HTMLElement;
  toolbar: HTMLElement;
  editorHost: HTMLElement;
  panel: HTMLElement;
  status: HTMLElement;
  toast: HTMLElement;
  rules: HTMLElement;
}

export function mountApp(root: AppRoot): void {
  const decoded = decode(location.hash);
  const initial = decoded ?? { v: 1 as const, f: 'json' as Format, d: '' };
  let currentFormat: Format = initial.f;
  // 복원된 해시의 포맷은 명시적 선택으로 간주 → 자동 감지가 덮어쓰지 않음(스펙 §6)
  let manual = decoded !== null;

  // ── 테마(다크 기본 + 라이트 토글, 유리 투명도/흐림) ──
  let theme = loadTheme();
  applyTheme(theme);
  // 적용은 실시간(가벼운 CSS 변수), 저장은 디바운스 → 슬라이더 드래그 중 localStorage 폭주 방지
  const persistTheme = debounce(() => saveTheme(theme), 400);
  function openTheme(): void {
    openThemePanel(
      theme,
      (t) => {
        theme = { ...t, mode: theme.mode }; // 팝오버는 alpha/blur만 다룸 — 모드는 헤더 토글 소관
        applyTheme(theme);
        persistTheme();
      },
      settingsBtn, // ⚙ 재클릭이 '닫힘'으로 동작하도록 앵커 전달
    );
  }

  // ── 헤더: 로고(좌) / 테마설정·다크토글·GitHub(우) ──
  const brand = document.createElement('div');
  brand.id = 'brand';
  brand.innerHTML = 'simple<span>Parser</span>';
  const headerActions = document.createElement('div');
  headerActions.id = 'header-actions';
  const settingsBtn = button('⚙');
  settingsBtn.className = 'icon-btn';
  settingsBtn.title = '테마설정';
  settingsBtn.addEventListener('click', openTheme);
  const modeBtn = button('');
  modeBtn.className = 'icon-btn';
  modeBtn.title = '라이트/다크 전환';
  function refreshModeBtn(): void {
    modeBtn.textContent = theme.mode === 'dark' ? '☀' : '☾';
  }
  modeBtn.addEventListener('click', () => {
    theme = { ...theme, mode: theme.mode === 'dark' ? 'light' : 'dark' };
    applyTheme(theme);
    saveTheme(theme); // 모드 토글은 단발 클릭 → 즉시 저장(디바운스 대기 중 새로고침해도 유지)
    editor.setDark(theme.mode === 'dark');
    refreshModeBtn();
  });
  refreshModeBtn();
  const ghLink = document.createElement('a');
  ghLink.className = 'icon-btn';
  ghLink.href = 'https://github.com/gum798/simpleParser';
  ghLink.target = '_blank';
  ghLink.rel = 'noreferrer';
  ghLink.title = 'GitHub';
  ghLink.textContent = '{ }';
  headerActions.append(settingsBtn, modeBtn, ghLink);
  root.header.append(brand, headerActions);

  // ── 툴바: 포맷 세그먼트 컨트롤 + 항상 보이는 액션 버튼(스펙: 드롭다운에 숨기지 않기) ──
  const seg = document.createElement('div');
  seg.className = 'seg';
  const segBtns = new Map<Format, HTMLButtonElement>();
  for (const f of FORMATS) {
    const b = button(f === 'markdown' ? 'MD' : f.toUpperCase());
    b.className = 'seg-btn';
    b.dataset.fmt = f;
    b.addEventListener('click', () => {
      manual = true;
      currentFormat = f;
      editor.setLanguage(f);
      refreshToolbarForFormat();
      // 열린 OUTPUT의 컨트롤(뷰 전환·복사)·본문·진단을 새 포맷으로 동기화
      // (setLanguage는 docChanged가 아니라 onEdit 재렌더가 타지 않는다)
      if (!root.panel.hidden) renderPanelContent();
      persist();
    });
    segBtns.set(f, b);
    seg.appendChild(b);
  }
  const formatBtn = button('정렬');
  formatBtn.className = 'btn';
  formatBtn.addEventListener('click', () => runFormat());
  // 원본 유지(제자리 정렬): 켜면 정렬이 주변 텍스트(로그 접두어 등)를 지우지 않고
  // JSON 블록만 그 자리에서 펼친다. 개인 취향 설정 → 규칙창 도킹처럼 localStorage에 저장.
  const KEEP_KEY = 'simpleparser.keepOriginal';
  let keepOriginal = false;
  try {
    keepOriginal = localStorage.getItem(KEEP_KEY) === '1';
  } catch {
    /* 프라이빗 모드 등 → 기본(끔) */
  }
  const keepBtn = button('원본 유지');
  keepBtn.className = 'btn';
  keepBtn.title = '정렬해도 주변 텍스트(로그 등)를 지우지 않고 JSON만 제자리에서 펼침';
  keepBtn.setAttribute('aria-pressed', String(keepOriginal));
  keepBtn.addEventListener('click', () => {
    keepOriginal = !keepOriginal;
    try {
      localStorage.setItem(KEEP_KEY, keepOriginal ? '1' : '0');
    } catch {
      /* 무시 */
    }
    keepBtn.setAttribute('aria-pressed', String(keepOriginal));
  });
  const copyBtn = button('복사');
  copyBtn.className = 'btn';
  copyBtn.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(editor.getValue());
        copyBtn.textContent = '✓ 복사됨';
        copyBtn.classList.add('ok');
      } catch {
        copyBtn.textContent = '복사 실패';
      }
      setTimeout(() => {
        copyBtn.textContent = '복사';
        copyBtn.classList.remove('ok');
      }, 1500);
    })();
  });
  const cleanBtn = button('클린');
  cleanBtn.className = 'btn';
  cleanBtn.addEventListener('click', doClean);
  const viewBtn = button('');
  viewBtn.className = 'btn';
  viewBtn.addEventListener('click', toggleView);
  const highlightBtn = button('하이라이트');
  highlightBtn.className = 'btn';
  highlightBtn.addEventListener('click', toggleRules);
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  const saveBtn = button('저장');
  saveBtn.className = 'btn primary';
  saveBtn.addEventListener('click', () => void save());
  root.toolbar.append(seg, formatBtn, keepBtn, copyBtn, cleanBtn, viewBtn, highlightBtn, spacer, saveBtn);

  const editor = createEditor(
    root.editorHost,
    { text: initial.d, fmt: currentFormat, dark: theme.mode === 'dark' },
    onChange,
  );

  // ── 패널 라벨(INPUT/OUTPUT 카드 헤더) + 입력창 호버 클리어 ──
  const inputPane = root.editorHost.closest('.pane');
  if (inputPane) {
    const head = paneHead('INPUT');
    // ✕는 헤더 우측에 — 본문 텍스트 위에 겹치지 않고 터치 기기에서도 오클릭 삭제가 없다(리뷰 반영)
    const clearBtn = button('✕');
    clearBtn.className = 'pane-clear';
    clearBtn.title = '내용 지우기';
    clearBtn.addEventListener('click', doClean);
    head.appendChild(clearBtn);
    inputPane.prepend(head);
  }
  const panelBody = document.createElement('div');
  panelBody.className = 'pane-body';
  // 트리 뎁스 컨트롤(OUTPUT 헤더): 기본값은 트리 분석 후 최대뎁스의 절반(내림, 최소 1)
  let userDepth: number | null = null; // 사용자가 조절하면 유지, null이면 기본값 사용
  const depthCtrl = document.createElement('span');
  depthCtrl.className = 'depth-ctrl';
  depthCtrl.hidden = true;
  const depthLabel = document.createElement('span');
  depthLabel.textContent = '뎁스';
  const depthMinus = button('−');
  depthMinus.className = 'depth-btn';
  depthMinus.title = '한 단계 접기';
  const depthVal = document.createElement('span');
  depthVal.className = 'depth-val';
  const depthPlus = button('+');
  depthPlus.className = 'depth-btn';
  depthPlus.title = '한 단계 펼치기';
  function nudgeDepth(delta: number): void {
    userDepth = Math.max(1, Number(depthVal.textContent || '1') + delta);
    renderPanelContent();
  }
  depthMinus.addEventListener('click', () => nudgeDepth(-1));
  depthPlus.addEventListener('click', () => nudgeDepth(1));
  depthCtrl.append(depthLabel, depthMinus, depthVal, depthPlus);
  // OUTPUT 뷰 전환(트리|텍스트) — markdown(미리보기 전용)에는 숨김. 뷰 상태는 세션 한정:
  // 원본 유지 정렬이 텍스트 뷰를 자동으로 열어주므로 URL/localStorage 저장은 하지 않는다.
  let panelView: 'tree' | 'text' = 'tree';
  const viewSeg = document.createElement('span');
  viewSeg.className = 'view-seg';
  const viewBtns: Array<[HTMLButtonElement, 'tree' | 'text']> = [];
  for (const [label, v] of [
    ['트리', 'tree'],
    ['텍스트', 'text'],
  ] as const) {
    const b = button(label);
    b.className = 'view-btn';
    b.dataset.view = v;
    b.addEventListener('click', () => {
      if (panelView === v) return;
      panelView = v;
      renderPanelContent();
    });
    viewBtns.push([b, v]);
    viewSeg.appendChild(b);
  }
  // 텍스트 뷰 전용 복사(정렬 결과) — 툴바 [복사]는 입력을 복사하므로 별도 버튼.
  const copyOutBtn = button('복사');
  copyOutBtn.className = 'output-copy';
  copyOutBtn.title = '정렬 결과 복사';
  copyOutBtn.hidden = true;
  let lastOutput: string | undefined;
  copyOutBtn.addEventListener('click', () => {
    if (!lastOutput) return; // 빈 문자열 방어(노출 조건과 어긋나도 빈 복사 금지)
    const output = lastOutput;
    void (async () => {
      try {
        await navigator.clipboard.writeText(output);
        showToast('정렬 결과를 복사했습니다');
      } catch {
        showToast('복사 실패 — 결과를 드래그해 복사하세요');
      }
    })();
  });
  const panelHead = paneHead('OUTPUT');
  panelHead.append(viewSeg, copyOutBtn, depthCtrl);
  root.panel.append(panelHead, panelBody);

  // ── INPUT/OUTPUT 좌우 너비 조절: 디바이더 드래그(개인 취향 → localStorage) ──
  const PANEL_W_KEY = 'simpleparser.panelW';
  const MIN_PANEL_W = 220; // OUTPUT 최소 폭
  const MIN_INPUT_W = 300; // INPUT 최소 폭(디바이더가 왼쪽 끝까지 못 가게)
  const divider = document.createElement('div');
  divider.className = 'pane-divider';
  divider.title = '드래그로 좌우 너비 조절 · 더블클릭으로 초기화';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.hidden = true; // 패널이 열릴 때만 표시
  root.panel.before(divider);
  const content = root.panel.parentElement as HTMLElement; // #content
  function applyPanelWidth(px: number | null): void {
    if (px === null) {
      content.style.removeProperty('--panel-w');
      content.style.removeProperty('--panel-max');
    } else {
      content.style.setProperty('--panel-w', `${px}px`);
      content.style.setProperty('--panel-max', 'none'); // 기본 상한(520px)은 사용자 조절 시 해제
    }
  }
  try {
    const saved = Number(localStorage.getItem(PANEL_W_KEY));
    if (Number.isFinite(saved) && saved >= MIN_PANEL_W) applyPanelWidth(saved);
  } catch {
    /* 프라이빗 모드 등 → 기본 너비 */
  }
  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // 드래그 중 텍스트 선택 방지
    divider.setPointerCapture(e.pointerId);
    divider.classList.add('dragging');
    const startX = e.clientX;
    const startW = root.panel.getBoundingClientRect().width; // 시작점 기준 상대 이동(첫 이동 점프 방지)
    const maxW = content.getBoundingClientRect().width - MIN_INPUT_W;
    let w: number | null = null;
    const onMove = (ev: PointerEvent): void => {
      w = Math.min(Math.max(startW + (startX - ev.clientX), MIN_PANEL_W), maxW);
      applyPanelWidth(w);
    };
    const onUp = (): void => {
      divider.classList.remove('dragging');
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onUp);
      if (w !== null) {
        try {
          localStorage.setItem(PANEL_W_KEY, String(Math.round(w)));
        } catch {
          /* 무시 */
        }
      }
    };
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
  });
  divider.addEventListener('dblclick', () => {
    applyPanelWidth(null); // 기본 너비(38%, 최대 520px)로 복귀
    try {
      localStorage.removeItem(PANEL_W_KEY);
    } catch {
      /* 무시 */
    }
  });

  // 패널 열림 상태(트리/미리보기, 하이라이트 규칙)는 URL로 저장/복원한다.
  let panelOpen = false;
  let rulesOpen = false;

  // 규칙창 도킹 위치(아래/오른쪽)는 개인 취향 → localStorage에 저장(URL 상태와 무관)
  const DOCK_KEY = 'simpleparser.rulesDock';
  let rulesDockRight = false;
  try {
    rulesDockRight = localStorage.getItem(DOCK_KEY) === 'right';
  } catch {
    /* 프라이빗 모드 등 → 기본(아래) */
  }
  const rulesHeader = document.createElement('div');
  rulesHeader.className = 'rules-header';
  const dockBtn = button('');
  dockBtn.className = 'rules-dock';
  rulesHeader.appendChild(dockBtn);
  const rulesGrid = document.createElement('div');
  rulesGrid.className = 'rules-grid';
  root.rules.append(rulesHeader, rulesGrid);

  // URL에 규칙이 있으면 그것으로 시작(공유 링크 재현), 없으면 localStorage 기본값.
  let currentRules = initial.r ?? loadRules();
  const rulesPanel = mountRulesPanel(rulesGrid, (rs) => {
    currentRules = rs;
    saveRules(rs);
    editor.setHighlightRules(rs);
    persist(); // 규칙 편집은 localStorage + URL 둘 다 갱신
    syncRulesPad(); // 규칙 추가/삭제로 오버레이 크기 바뀌면 여백 갱신
    if (!root.panel.hidden) renderPanelContent(); // 트리 하이라이트도 즉시 갱신
  });
  rulesPanel.render(currentRules);
  editor.setHighlightRules(currentRules);

  function syncRulesPad(): void {
    // 오버레이 실제 크기를 CSS 변수로 → 도킹 방향에 맞는 여백 확보(가려진 내용을 스크롤로 볼 수 있게)
    document.body.style.removeProperty('--rules-h');
    document.body.style.removeProperty('--rules-w');
    if (root.rules.hidden) return;
    if (rulesDockRight) document.body.style.setProperty('--rules-w', `${root.rules.offsetWidth}px`);
    else document.body.style.setProperty('--rules-h', `${root.rules.offsetHeight}px`);
  }

  function applyRulesDock(): void {
    root.rules.classList.toggle('dock-right', rulesDockRight);
    document.body.classList.toggle('rules-right', rulesDockRight);
    dockBtn.textContent = rulesDockRight ? '⇩ 아래로' : '⇨ 오른쪽으로';
    syncRulesPad();
  }
  dockBtn.addEventListener('click', () => {
    rulesDockRight = !rulesDockRight;
    try {
      localStorage.setItem(DOCK_KEY, rulesDockRight ? 'right' : 'bottom');
    } catch {
      /* 무시 */
    }
    applyRulesDock();
  });
  applyRulesDock();

  // 빈 상태로 열면 입력 가능한 규칙 줄을 바로 보여줘 '패널이 안 열린 것처럼' 보이지 않게 함
  function openRulesPanel(): void {
    root.rules.hidden = false;
    rulesOpen = true;
    document.body.classList.add('rules-open');
    if (currentRules.length === 0) rulesPanel.render([createRule()]);
    syncRulesPad();
  }

  function toggleRules(): void {
    if (root.rules.hidden) openRulesPanel();
    else {
      root.rules.hidden = true;
      rulesOpen = false;
      document.body.classList.remove('rules-open');
    }
    persist();
  }

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(msg: string): void {
    root.toast.textContent = msg;
    root.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer); // 연속 토스트가 이전 타이머에 일찍 닫히지 않도록
    toastTimer = setTimeout(() => (root.toast.hidden = true), 2000);
  }

  function applyDiagnostics(diags: Diagnostic[]): void {
    editor.setDiagnostics(diags);
    root.status.textContent = formatDiagnosticLine(diags);
  }

  function refreshToolbarForFormat(): void {
    formatBtn.disabled = !canFormat(currentFormat); // markdown은 정렬 불가
    viewBtn.textContent = viewLabel(currentFormat, panelView); // 버튼이 열 뷰와 라벨 일치
    for (const [f, b] of segBtns) b.classList.toggle('active', f === currentFormat);
  }

  // 현재 전체 상태(포맷·내용·규칙·패널 열림)를 한곳에서 만든다 — persist와 save가 공유.
  function currentState(): State {
    return { v: 1, f: currentFormat, d: editor.getValue(), r: currentRules, p: panelOpen, h: rulesOpen };
  }

  const persist = debounce(() => {
    // replaceState로 현재 히스토리 항목만 갱신 → 타이핑 중 뒤로가기 히스토리 오염 방지(스펙 §4.2)
    history.replaceState(null, '', '#' + encode(currentState()));
  }, 400);

  const onEdit = debounce(() => {
    if (!manual) {
      const guess = detectFormat(editor.getValue());
      if (guess !== currentFormat) {
        currentFormat = guess;
        editor.setLanguage(guess);
        refreshToolbarForFormat();
      }
    }
    // 타이핑 중에도 진단을 재계산해 인라인 밑줄/상태줄이 오래된 채로 남지 않게 함
    applyDiagnostics(format(editor.getValue(), currentFormat).diagnostics);
    // 출력 패널이 열려 있으면 함께 갱신 — 낡은 트리 오프셋으로 잘못된 위치를 선택하는 것 방지
    if (!root.panel.hidden) renderPanelContent();
  }, 300);

  function onChange(): void {
    onEdit();
    persist();
  }

  // safeOnly=true(자동/붙여넣기 경로)일 때는 '들여쓰기만 바뀌는 비파괴 정렬'만 적용한다.
  // 수동 [정렬] 버튼(safeOnly 없음)은 기존대로 로그 속 JSON 추출 등 적극적 정렬을 그대로 수행.
  function runFormat(opts?: { safeOnly?: boolean }): void {
    const input = editor.getValue();
    // 원본 유지: 주변 텍스트(로그 접두어 등)를 지우지 않는 제자리 정렬만 적용한다.
    // 데이터가 줄어들 수 있는 결과(관용 복구·중복 키 병합)는 formatKeepOriginal이 보류하고,
    // 자동(붙여넣기) 경로는 입력을 건드리지 않도록 조용히 통과한다.
    if (keepOriginal) {
      if (!opts?.safeOnly) {
        const r = formatKeepOriginal(input, currentFormat);
        const errs = (ds: Diagnostic[]): number => ds.filter((d) => d.severity === 'error').length;
        if (r.output !== undefined && r.output !== input) {
          // 교체 후 본문 기준으로 재검사: 새 에러가 생기면 보류(통짜 경로와 동일한 안전 정책)
          const after = format(r.output, currentFormat);
          if (errs(after.diagnostics) > errs(r.diagnostics)) {
            showToast('정렬을 보류했습니다(원문 보존)');
            applyDiagnostics(r.diagnostics);
            return;
          }
          editor.setValue(r.output);
          editor.scrollToTop();
          // 위치 없는 변환 경고(랩 복구 등)는 유지하고 토스트로도 알림 — 이후 재계산에 덮여도 고지가 남게
          const notices = r.diagnostics.filter((d) => d.offset === undefined && d.severity === 'warning');
          if (notices.length > 0) showToast(notices[0].message);
          applyDiagnostics([...notices, ...after.diagnostics]); // 교체된 새 본문에 맞는 진단(오프셋 일치)
        } else {
          if (r.output === undefined) showToast('정렬을 보류했습니다(원문 보존)');
          applyDiagnostics(r.diagnostics);
        }
      }
      return;
    }
    const before = format(input, currentFormat);
    if (before.output !== undefined) {
      // 안전 정책: 정렬 결과가 새 에러를 만들면 보류
      const after = format(before.output, currentFormat);
      const noNewErrors = after.diagnostics.length <= before.diagnostics.length;
      // 자동 경로는 '충실한 정렬'일 때만 적용 → 추출/주석제거 등 내용 변경은 보류(수동 [정렬] 전용).
      // faithful 미설정(json 외 포맷)은 추출 위험이 없어 충실로 간주.
      const contentPreserved = !opts?.safeOnly || before.faithful !== false;
      if (noNewErrors && contentPreserved) {
        editor.setValue(before.output);
        editor.scrollToTop(); // 정렬 후 좌상단으로(이전 가로 스크롤 때문에 빈 화면처럼 보이지 않게)
        applyDiagnostics(after.diagnostics); // 교체된 새 내용에 맞는 진단(오프셋 일치)
      } else {
        if (!opts?.safeOnly) showToast('정렬을 보류했습니다(원문 보존)');
        applyDiagnostics(before.diagnostics);
      }
    } else {
      applyDiagnostics(before.diagnostics);
    }
    persist();
  }

  // 유휴 시간에 자동 정렬을 돌려 붙여넣기/렌더를 막지 않는다. timeout으로 바쁜 메인스레드에서도 결국 실행.
  // requestIdleCallback 미지원(구형 Safari 등) 시 setTimeout 폴백.
  const idle: (cb: () => void) => void =
    typeof window.requestIdleCallback === 'function'
      ? (cb) => void window.requestIdleCallback(cb, { timeout: 1000 })
      : (cb) => void setTimeout(cb, 0);

  function autoParse(): void {
    const text = editor.getValue();
    if (text.trim() === '') return;
    // 감지: 수동 선택 중이 아니면 포맷을 자동 감지(가볍고 비파괴적)
    if (!manual) {
      const guess = detectFormat(text);
      if (guess !== currentFormat) {
        currentFormat = guess;
        editor.setLanguage(guess);
        refreshToolbarForFormat();
      }
    }
    // 자동 정렬은 작은 입력 + 비파괴 정렬만(safeOnly). 큰 입력은 안내만(정렬 가능한 포맷일 때).
    if (shouldAutoFormat(text, currentFormat)) runFormat({ safeOnly: true });
    else if (text.length > AUTO_FORMAT_MAX && canFormat(currentFormat)) {
      showToast('큰 입력 — [정렬]을 눌러 직접 정렬하세요');
    }
  }

  // 붙여넣기에만 자동 정렬을 건다(타이핑 중엔 안 함 → '너무 자주' 방지).
  // 단, 에디터 본문(.cm-content)에 붙여넣은 경우만 — 검색/치환 입력칸 등 내부 input 붙여넣기는 제외.
  root.editorHost.addEventListener('paste', (e) => {
    const content = root.editorHost.querySelector('.cm-content');
    if (content && e.target instanceof Node && content.contains(e.target)) idle(autoParse);
  });

  // 우클릭 → 색상 팔레트 → 선택 텍스트를 리터럴 하이라이트 규칙으로 추가(같은 규칙은 색만 갱신)
  mountContextHighlight({
    host: root.editorHost,
    getSelectionText: () => editor.getSelectionText(),
    onPick: (text, color) => {
      if (text.length > MAX_HIGHLIGHT_SELECTION) {
        showToast('선택이 너무 깁니다 — 더 짧게 선택하세요');
        return;
      }
      const regex = regexEscape(text);
      const idx = currentRules.findIndex((r) => r.regex === regex);
      const next =
        idx >= 0
          ? currentRules.map((r, i) =>
              i === idx ? { ...r, bgColor: color.bg, textColor: color.text, enabled: true } : r,
            )
          : [
              ...currentRules,
              { ...createRule(), regex, name: truncateLabel(text, 30), bgColor: color.bg, textColor: color.text },
            ];
      currentRules = next;
      saveRules(next);
      editor.setHighlightRules(next);
      rulesPanel.render(next);
      syncRulesPad();
      persist();
      if (!root.panel.hidden) renderPanelContent(); // 트리 하이라이트도 즉시 갱신
      showToast(`"${truncateLabel(text, 12)}" 강조 규칙 적용`);
    },
  });

  function jumpTo(node: TreeNode): void {
    const r = node.pos ?? approxFind(editor.getValue(), node);
    if (r) editor.revealRange(r.from, r.to);
  }

  function renderPanelContent(): void {
    const scrollTop = panelBody.scrollTop; // 재렌더 시 보던 위치 유지
    panelBody.innerHTML = '';
    viewSeg.hidden = !canFormat(currentFormat); // markdown은 미리보기 전용 → 전환 숨김
    for (const [b, v] of viewBtns) b.classList.toggle('active', v === panelView);
    copyOutBtn.hidden = true;
    lastOutput = undefined; // 텍스트 뷰가 아닌 렌더에서 낡은 정렬 결과가 복사되지 않게 초기화
    viewBtn.textContent = viewLabel(currentFormat, panelView); // 뷰 전환 시 툴바 라벨 동기화
    if (currentFormat === 'markdown') {
      depthCtrl.hidden = true;
      const { html } = renderMarkdown(editor.getValue());
      const view = document.createElement('div');
      view.className = 'markdown-body';
      view.innerHTML = html; // 정화 완료된 HTML
      panelBody.appendChild(view);
    } else if (panelView === 'text') {
      // 텍스트 뷰: 입력은 그대로 두고 정렬 결과만 보여준다(원본 유지 정렬의 출력 창)
      depthCtrl.hidden = true;
      const r = format(editor.getValue(), currentFormat);
      // 빈 문자열 출력(html/xml의 빈 입력)도 '결과 없음' — 빈 화면·빈 클립보드 복사 방지
      lastOutput = r.output ? r.output : undefined;
      if (lastOutput !== undefined) {
        copyOutBtn.hidden = false;
        const pre = document.createElement('pre');
        pre.className = 'output-text';
        pre.append(highlightText(lastOutput, compileRules(currentRules)));
        panelBody.appendChild(pre);
      } else {
        const empty = document.createElement('div');
        empty.className = 'output-empty';
        empty.textContent = '정렬 결과 없음 — 입력을 확인하세요';
        panelBody.appendChild(empty);
      }
      applyDiagnostics(r.diagnostics);
    } else {
      const { root: treeRoot, diagnostics } = buildTree(editor.getValue(), currentFormat);
      if (treeRoot) {
        // 기본 뎁스 = 최대뎁스 절반(내림, 최소 1). 사용자가 조절했으면 그 값을 범위 안에서 유지.
        const md = Math.max(1, maxDepth(treeRoot));
        const d = Math.min(Math.max(userDepth ?? Math.max(1, Math.floor(md / 2)), 1), md);
        depthVal.textContent = String(d);
        depthCtrl.hidden = false;
        panelBody.appendChild(renderTree(treeRoot, jumpTo, d, compileRules(currentRules)));
      } else {
        depthCtrl.hidden = true;
      }
      applyDiagnostics(diagnostics);
    }
    panelBody.scrollTop = scrollTop;
  }

  function openPanel(): void {
    renderPanelContent();
    root.panel.hidden = false;
    divider.hidden = false; // 패널과 함께 너비 조절 디바이더 표시
    panelOpen = true;
  }

  function toggleView(): void {
    if (!root.panel.hidden) {
      root.panel.hidden = true; // 이미 열려 있으면 닫기(토글, 스펙 §4.4)
      divider.hidden = true;
      panelOpen = false;
    } else {
      openPanel();
    }
    persist();
  }

  // 저장 안내 팝업(<dialog>)
  const saveDialog = document.createElement('dialog');
  saveDialog.id = 'save-dialog';
  const saveMsgEl = document.createElement('p');
  saveMsgEl.className = 'save-msg';
  const saveRestoreEl = document.createElement('p');
  saveRestoreEl.className = 'save-restore';
  saveRestoreEl.textContent = '이 링크를 열면 문서가 그대로 복원됩니다.';
  const saveUrlEl = document.createElement('input');
  saveUrlEl.className = 'save-url';
  saveUrlEl.readOnly = true;
  const saveWarnEl = document.createElement('p');
  saveWarnEl.className = 'save-warn';
  saveWarnEl.hidden = true;
  saveWarnEl.textContent = '링크가 길어 일부 메신저에서 잘릴 수 있습니다.';
  // 사이트만 공유(문서 없이): 프래그먼트 뺀 도구 링크 복사. 모달 위엔 토스트가 안 보이므로 버튼 라벨로 피드백.
  const siteShareRow = document.createElement('p');
  siteShareRow.className = 'save-site';
  const siteShareBtn = button('사이트만 공유하기');
  const siteShareNote = document.createElement('span');
  siteShareNote.className = 'save-site-note';
  siteShareNote.textContent = ' 문서 없이 이 도구 링크만';
  siteShareRow.append(siteShareBtn, siteShareNote);
  siteShareBtn.addEventListener('click', () => {
    void (async () => {
      const siteUrl = location.origin + location.pathname; // 해시(#문서) 제외
      try {
        await navigator.clipboard.writeText(siteUrl);
        siteShareBtn.textContent = '사이트 링크 복사됨 ✓';
      } catch {
        siteShareBtn.textContent = '복사 실패 — 주소창의 # 앞부분';
      }
      setTimeout(() => (siteShareBtn.textContent = '사이트만 공유하기'), 1800);
    })();
  });
  const saveForm = document.createElement('form');
  saveForm.method = 'dialog';
  const saveCloseBtn = button('닫기');
  // button() 헬퍼가 type='button'을 강제하므로 form method=dialog 제출이 안 됨 → 명시적으로 닫는다
  saveCloseBtn.addEventListener('click', () => saveDialog.close());
  saveForm.appendChild(saveCloseBtn);
  saveDialog.append(saveMsgEl, saveRestoreEl, saveUrlEl, saveWarnEl, siteShareRow, saveForm);
  document.body.appendChild(saveDialog);

  function openSaveDialog(url: string, copied: boolean): void {
    saveMsgEl.textContent = saveMessage(copied);
    saveUrlEl.value = url;
    saveWarnEl.hidden = url.length <= URL_WARN_LEN;
    if (typeof saveDialog.showModal === 'function') saveDialog.showModal();
    saveUrlEl.focus();
    saveUrlEl.select();
  }

  async function save(): Promise<void> {
    // 디바운스 대기 중일 수 있으므로 해시를 동기적으로 먼저 최신화한 뒤 복사(스펙 §4.5)
    history.replaceState(null, '', '#' + encode(currentState()));
    const url = location.href;
    let copied = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      copied = false; // 비보안 컨텍스트 등 → 팝업에서 직접 복사
    }
    openSaveDialog(url, copied);
  }

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); // 브라우저 기본 '페이지 저장' 차단
      void save();
    }
  });

  function doClean(): void {
    if (editor.getValue() === '') return;
    editor.setValue(''); // onChange가 persist까지 처리. Cmd/Ctrl+Z로 복구 가능
    applyDiagnostics([]);
    showToast('내용을 지웠습니다 · Cmd/Ctrl+Z로 되돌리기');
  }

  refreshToolbarForFormat();
  if (initial.d) applyDiagnostics(format(initial.d, currentFormat).diagnostics);
  // URL에 저장된 패널 열림 상태 복원(공유 링크가 같은 화면을 재현)
  if (initial.h) openRulesPanel();
  if (initial.p) openPanel();
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.type = 'button';
  return b;
}

/** 카드 상단의 작은 라벨 바(INPUT / OUTPUT). */
function paneHead(label: string): HTMLElement {
  const head = document.createElement('div');
  head.className = 'pane-head';
  const span = document.createElement('span');
  span.className = 'pane-label';
  span.textContent = label;
  head.appendChild(span);
  return head;
}
