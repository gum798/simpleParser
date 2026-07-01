export interface SwatchColor {
  name: string;
  bg: string; // #rrggbb
  text: string; // #rrggbb
}

/** 우클릭 팔레트 프리셋 12색(6열 × 2줄, 모두 검정 글자에 밝은 배경). */
export const PALETTE: SwatchColor[] = [
  { name: '노랑', bg: '#ffff00', text: '#000000' },
  { name: '초록', bg: '#b6f2b6', text: '#000000' },
  { name: '파랑', bg: '#cfe8ff', text: '#000000' },
  { name: '분홍', bg: '#ffd6e7', text: '#000000' },
  { name: '주황', bg: '#ffe0b3', text: '#000000' },
  { name: '보라', bg: '#e2d1ff', text: '#000000' },
  { name: '빨강', bg: '#ffc9c9', text: '#000000' },
  { name: '청록', bg: '#96f2d7', text: '#000000' },
  { name: '하늘', bg: '#a5d8ff', text: '#000000' },
  { name: '라임', bg: '#d8f5a2', text: '#000000' },
  { name: '자홍', bg: '#eebefa', text: '#000000' },
  { name: '회색', bg: '#dee2e6', text: '#000000' },
];

/** 팝업 라벨/규칙명용: 공백 정리 후 길면 …으로 축약. */
export function truncateLabel(s: string, max = 20): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine;
}

export interface ContextHighlightDeps {
  host: HTMLElement;
  getSelectionText: () => string;
  onPick: (selectedText: string, color: SwatchColor) => void;
}

/**
 * 에디터에서 텍스트를 선택하고 우클릭하면 색상 팔레트를 띄우고, 색을 고르면
 * onPick(선택텍스트, 색)을 호출한다. 선택이 없으면 기본 브라우저 메뉴를 그대로 둔다.
 */
export function mountContextHighlight(deps: ContextHighlightDeps): void {
  let menu: HTMLElement | null = null;

  function close(): void {
    if (!menu) return;
    menu.remove();
    menu = null;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onDocDown(e: MouseEvent): void {
    if (menu && e.target instanceof Node && !menu.contains(e.target)) close();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  deps.host.addEventListener('contextmenu', (e) => {
    const sel = deps.getSelectionText();
    if (sel.trim() === '') return; // 선택 없음 → 기본 메뉴 유지(가로채지 않음)
    e.preventDefault();
    close();
    menu = buildMenu(e.clientX, e.clientY, sel);
    document.body.appendChild(menu);
    // 화면 밖으로 넘치면 안쪽으로 당김
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth) menu.style.left = Math.max(0, window.innerWidth - r.width - 8) + 'px';
    if (r.bottom > window.innerHeight) menu.style.top = Math.max(0, window.innerHeight - r.height - 8) + 'px';
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey, true);
  });

  function buildMenu(x: number, y: number, sel: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ctx-highlight';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    const label = document.createElement('div');
    label.className = 'ctx-label';
    label.textContent = `"${truncateLabel(sel)}" 강조`;
    const row = document.createElement('div');
    row.className = 'ctx-swatches';
    for (const c of PALETTE) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'ctx-swatch';
      sw.title = c.name;
      sw.style.backgroundColor = c.bg;
      sw.addEventListener('click', () => {
        close(); // 먼저 메뉴/리스너 정리 → onPick이 실패해도 잔존물 없음
        deps.onPick(sel, c);
      });
      row.appendChild(sw);
    }
    el.append(label, row);
    return el;
  }
}
