import { type Theme, ALPHA_MIN, ALPHA_MAX, BLUR_MIN, BLUR_MAX } from './theme';

let popover: HTMLElement | null = null;
let anchorEl: HTMLElement | null = null;

function close(): void {
  popover?.remove();
  popover = null;
  anchorEl = null;
  document.removeEventListener('mousedown', onDocDown, true);
  document.removeEventListener('keydown', onKey, true);
}
function onDocDown(e: MouseEvent): void {
  if (!popover || !(e.target instanceof Node)) return;
  // 앵커(⚙) 클릭은 여기서 닫지 않는다 → click 단계의 openThemePanel이 토글로 닫게 함
  if (anchorEl && anchorEl.contains(e.target)) return;
  if (!popover.contains(e.target)) close();
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}

/**
 * 테마설정 팝오버를 연다(토글). 비모달 → 뒤 패널의 투명도 변화가 실시간으로 보인다.
 * 슬라이더를 움직이면 onChange(새 테마)를 호출한다(적용/저장은 호출측 책임).
 */
export function openThemePanel(theme: Theme, onChange: (t: Theme) => void, anchor?: HTMLElement): void {
  if (popover) {
    close();
    return;
  }
  anchorEl = anchor ?? null;
  let cur: Theme = { ...theme };
  popover = document.createElement('div');
  popover.className = 'theme-panel';
  popover.id = 'theme-panel';

  const title = document.createElement('div');
  title.className = 'theme-title';
  title.textContent = '테마설정';

  const alphaRow = slider('투명도', ALPHA_MIN * 100, ALPHA_MAX * 100, Math.round(cur.alpha * 100), '%', (v) => {
    cur = { ...cur, alpha: v / 100 };
    onChange(cur);
  });
  const blurRow = slider('흐림', BLUR_MIN, BLUR_MAX, cur.blur, 'px', (v) => {
    cur = { ...cur, blur: v };
    onChange(cur);
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'theme-close';
  closeBtn.textContent = '닫기';
  closeBtn.addEventListener('click', () => close());

  popover.append(title, alphaRow.row, blurRow.row, closeBtn);
  document.body.appendChild(popover);
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
}

function slider(
  label: string,
  min: number,
  max: number,
  value: number,
  unit: string,
  on: (v: number) => void,
): { row: HTMLElement } {
  const row = document.createElement('label');
  row.className = 'theme-row';
  const name = document.createElement('span');
  name.className = 'theme-label';
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'theme-slider';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  const val = document.createElement('span');
  val.className = 'theme-val';
  val.textContent = `${value}${unit}`;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    val.textContent = `${v}${unit}`;
    on(v);
  });
  row.append(name, input, val);
  return { row };
}
