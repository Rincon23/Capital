/** Lightweight per-device preferences. Not part of the budget data model, so localStorage is fine here. */

const THEME_KEY = 'capital:theme';
const LAST_MONTH_KEY = 'capital:lastMonth';

export type Theme = 'light' | 'dark' | 'system';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_KEY, theme);
}

export function getLastViewedMonth(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LAST_MONTH_KEY);
}

export function setLastViewedMonth(month: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_MONTH_KEY, month);
}
