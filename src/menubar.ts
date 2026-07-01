export interface MenuItemDef {
  label: string | (() => string); // 동적 라벨(예: 트리/미리보기) 지원
  disabled?: () => boolean; // 동적 비활성(예: markdown에서 정렬 불가)
  run: () => void;
}

export interface MenuDef {
  title: string;
  items: MenuItemDef[];
}

/**
 * 상단 메뉴바(편집/보기 등)를 bar에 붙인다. 각 메뉴는 클릭 시 드롭다운을 열고,
 * 항목은 열릴 때마다 새로 그려 동적 라벨/비활성 상태를 반영한다. 바깥클릭·Esc·재클릭으로 닫힘.
 */
export function mountMenubar(bar: HTMLElement, menus: MenuDef[]): void {
  let dropdown: HTMLElement | null = null;
  let openTitle = '';

  function close(): void {
    dropdown?.remove();
    dropdown = null;
    openTitle = '';
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onDocDown(e: MouseEvent): void {
    const t = e.target;
    if (!(t instanceof Node)) return;
    // 드롭다운 내부나 메뉴 버튼 클릭은 각자의 핸들러가 처리 → 여기선 바깥 클릭만 닫는다
    if (dropdown && !dropdown.contains(t) && !(t instanceof Element && t.closest('.menu-btn'))) close();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  for (const menu of menus) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.textContent = `${menu.title} ▾`;
    btn.addEventListener('click', () => {
      const sameOpen = openTitle === menu.title;
      close();
      if (sameOpen) return; // 같은 메뉴 재클릭 → 토글로 닫기
      dropdown = buildDropdown(menu, btn);
      openTitle = menu.title;
      document.body.appendChild(dropdown);
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onKey, true);
    });
    bar.appendChild(btn);
  }

  function buildDropdown(menu: MenuDef, btn: HTMLElement): HTMLElement {
    const dd = document.createElement('div');
    dd.className = 'menu-dropdown';
    const r = btn.getBoundingClientRect();
    dd.style.left = `${r.left}px`;
    dd.style.top = `${r.bottom + 4}px`;
    for (const item of menu.items) {
      const ib = document.createElement('button');
      ib.type = 'button';
      ib.className = 'menu-item';
      ib.textContent = typeof item.label === 'function' ? item.label() : item.label;
      if (item.disabled?.()) ib.disabled = true;
      ib.addEventListener('click', () => {
        close();
        item.run();
      });
      dd.appendChild(ib);
    }
    return dd;
  }
}
