// 테마 설정: 다크/라이트 모드 + 떠 있는 유리 요소의 투명도(alpha)·흐림(blur). localStorage에 저장.
export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode; // 스펙: 다크 기본 + 라이트 토글
  alpha: number; // 유리 패널 배경 불투명도 0.2~1 (낮을수록 뒤가 더 보임)
  blur: number; // backdrop blur px 0~20
}

const KEY = 'simpleparser.theme';
export const DEFAULT_THEME: Theme = { mode: 'dark', alpha: 0.2, blur: 3 };
export const ALPHA_MIN = 0.2;
export const ALPHA_MAX = 1;
export const BLUR_MIN = 0;
export const BLUR_MAX = 20;

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** 임의 입력을 유효 범위로 보정한다. */
export function clampTheme(t: Partial<Theme> | null | undefined): Theme {
  return {
    mode: t?.mode === 'light' ? 'light' : 'dark',
    alpha: clampNum(t?.alpha, ALPHA_MIN, ALPHA_MAX, DEFAULT_THEME.alpha),
    blur: clampNum(t?.blur, BLUR_MIN, BLUR_MAX, DEFAULT_THEME.blur),
  };
}

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_THEME };
    return clampTheme(JSON.parse(raw) as Partial<Theme>);
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* 프라이빗 모드 등 → 무시 */
  }
}

/** data-theme + CSS 변수 반영 → 모드 전환과 유리 표면이 실시간으로 바뀐다. */
export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = t.mode;
  root.style.setProperty('--glass-alpha', String(t.alpha));
  root.style.setProperty('--glass-blur', `${t.blur}px`);
}
