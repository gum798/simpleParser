import type { Diagnostic, Format } from './types';
import { detectFormat } from './detect';
import { format } from './format/index';
import { buildTree, renderTree } from './tree';
import { renderMarkdown } from './preview';
import { encode, decode } from './urlState';
import { createEditor } from './editor';
import { debounce } from './util/debounce';
import { mountRulesPanel } from './rulesPanel';
import { loadRules, saveRules } from './highlight/store';

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

export function saveMessage(copied: boolean): string {
  return copied
    ? '💾 저장됨! 링크가 클립보드에 복사되었습니다.'
    : '💾 저장됨! 아래 링크를 직접 복사하세요 (자동 복사가 막혔습니다).';
}

export interface AppRoot {
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
  const saveBtn = button('저장하기');
  const highlightBtn = button('하이라이트');
  root.toolbar.append(select, formatBtn, viewBtn, highlightBtn, saveBtn);

  const editor = createEditor(root.editorHost, { text: initial.d, fmt: currentFormat }, onChange);

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
    formatBtn.disabled = !canFormat(currentFormat);
    viewBtn.textContent = viewLabel(currentFormat);
    select.value = currentFormat;
  }

  const persist = debounce(() => {
    // replaceState로 현재 히스토리 항목만 갱신 → 타이핑 중 뒤로가기 히스토리 오염 방지(스펙 §4.2)
    history.replaceState(null, '', '#' + encode({ v: 1, f: currentFormat, d: editor.getValue() }));
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
  }, 300);

  function onChange(): void {
    onEdit();
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
  const saveForm = document.createElement('form');
  saveForm.method = 'dialog';
  saveForm.appendChild(button('닫기'));
  saveDialog.append(saveMsgEl, saveRestoreEl, saveUrlEl, saveWarnEl, saveForm);
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
    history.replaceState(null, '', '#' + encode({ v: 1, f: currentFormat, d: editor.getValue() }));
    const url = location.href;
    let copied = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      copied = false; // 비보안 컨텍스트 등 → 팝업에서 직접 복사
    }
    openSaveDialog(url, copied);
  }

  saveBtn.addEventListener('click', () => void save());
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); // 브라우저 기본 '페이지 저장' 차단
      void save();
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
