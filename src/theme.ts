export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

export const THEME_STORAGE_KEY = 'chart-tricks-theme';
// Keep these display colors synchronized with CSS and the early HTML bootstrap.
export const PALETTES = {
  light: {
    background: '#ffffff', ink: '#17212b', muted: '#586575', orange: '#c43b0d',
    grid: '#e3e7ec', minorGrid: '#eef0f3', axis: '#748091', line: '#dce1e7',
  },
  dark: {
    background: '#101820', ink: '#eef2f6', muted: '#adb9c8', orange: '#ff946f',
    grid: '#33424f', minorGrid: '#24333f', axis: '#8494a7', line: '#33424f',
  },
} as const;

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export function loadThemePreference(): ThemePreference {
  try { return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY)); }
  catch { return 'system'; }
}

export function saveThemePreference(preference: ThemePreference): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, preference); }
  catch { /* The current choice still works when browser storage is unavailable. */ }
}
