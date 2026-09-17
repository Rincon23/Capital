import type { BudgetSettings, ModuleKey, Month, NavKey } from '../budget/types';
import { MODULES, MODULE_GROUPS, moduleDefinition, type ModuleGroup } from './catalog';
import { parentOf, resolveModules } from './flags';

/** How many entries the user picks for the bottom bar; "Mais" always takes the fifth place. */
export const MAX_NAV_ITEMS = 4;

export interface NavEntry {
  key: NavKey;
  label: string;
  href: (month: Month) => string;
  isActive: (pathname: string) => boolean;
}

/** The home dashboard. It is not a module: it always exists, in the bar or in Mais. */
export const HOME_NAV: NavEntry = {
  key: 'inicio',
  label: 'Início',
  href: (month) => `/mes/${month}`,
  isActive: (pathname) => /^\/mes\/[^/]+\/?$/.test(pathname),
};

/** Screens that always live in Mais. */
const MORE_PATHS = ['/mais', '/modulos', '/rodape', '/configuracoes'];

type NavSource = Pick<BudgetSettings, 'modules' | 'nav'> | null | undefined;

export function navEntry(key: NavKey): NavEntry {
  if (key === 'inicio') return HOME_NAV;
  const { screen } = moduleDefinition(key);
  if (!screen) throw new Error(`O módulo ${key} não tem tela.`);
  return { key, ...screen };
}

/** What can go in the bottom bar right now: Início and every module that is on and has a screen. */
export function availableNavKeys(source: NavSource): NavKey[] {
  const modules = resolveModules(source);
  return ['inicio', ...MODULES.filter((m) => m.screen && modules[m.key]).map((m) => m.key)];
}

/**
 * The bottom bar, without "Mais". The user's choice, minus modules that were turned off since
 * (and repeats), up to four; with nothing saved (or nothing left of it), Início and the first
 * modules that are on, in catalog order.
 */
export function resolveNav(source: NavSource): NavKey[] {
  const available = availableNavKeys(source);
  const saved = source?.nav;
  if (saved) {
    const kept = saved.filter((key, index) => available.includes(key) && saved.indexOf(key) === index);
    if (kept.length > 0) return kept.slice(0, MAX_NAV_ITEMS);
  }
  return available.slice(0, MAX_NAV_ITEMS);
}

export interface MoreGroup {
  group: ModuleGroup;
  label: string;
  keys: ModuleKey[];
}

/**
 * The module screens Mais lists besides Início and its fixed entries: every module that is on and
 * has a screen, grouped, whether or not it is also in the bottom bar. Mais is the full list.
 */
export function moreItems(source: NavSource): MoreGroup[] {
  const modules = resolveModules(source);
  return MODULE_GROUPS.map(({ key, label }) => ({
    group: key,
    label,
    keys: MODULES.filter((m) => m.group === key && m.screen && modules[m.key]).map((m) => m.key),
  })).filter((group) => group.keys.length > 0);
}

/**
 * Which tab to light up: the bar entry whose screen is open, "mais" for any other screen of the
 * app (a module opened from Mais, the settings), or null for a page that is neither.
 */
export function activeNavKey(nav: NavKey[], pathname: string): NavKey | 'mais' | null {
  const inBar = nav.find((key) => navEntry(key).isActive(pathname));
  if (inBar) return inBar;
  const isAppScreen =
    MORE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    HOME_NAV.isActive(pathname) ||
    MODULES.some((m) => m.screen?.isActive(pathname));
  return isAppScreen ? 'mais' : null;
}

/** Where "/" goes: the first entry of the bottom bar. */
export function homeHref(source: NavSource, month: Month): string {
  return navEntry(resolveNav(source)[0] ?? 'inicio').href(month);
}

/**
 * The cards on the home dashboard, in order: the modules of the bottom bar, then those in Mais.
 * A module without a screen (the card bill, "A receber") comes right after the module it hangs
 * from.
 */
export function homeCards(source: NavSource): ModuleKey[] {
  const modules = resolveModules(source);
  const nav = resolveNav(source);
  const withScreen = [...nav, ...availableNavKeys(source).filter((key) => !nav.includes(key))].filter(
    (key): key is ModuleKey => key !== 'inicio',
  );

  const order: ModuleKey[] = [];
  const place = (key: ModuleKey) => {
    order.push(key);
    // Screenless children follow their parent (and their own children follow them).
    for (const m of MODULES) {
      if (!m.screen && m.homeCard && modules[m.key] && parentOf(m.key) === key) place(m.key);
    }
  };
  for (const key of withScreen) place(key);
  for (const m of MODULES) {
    if (!m.screen && m.homeCard && modules[m.key] && !order.includes(m.key)) place(m.key);
  }
  return order.filter((key) => moduleDefinition(key).homeCard);
}

/** The row that separates the bottom bar from Mais in the bottom-bar editor. */
export const MORE_DIVIDER = 'mais';

export type NavEditorItem = NavKey | typeof MORE_DIVIDER;

/** The editor's list: the bar, the divider, then everything else that could go in the bar. */
export function navEditorItems(source: NavSource): NavEditorItem[] {
  const nav = resolveNav(source);
  return [...nav, MORE_DIVIDER, ...availableNavKeys(source).filter((key) => !nav.includes(key))];
}

export type NavChange =
  | { ok: true; nav: NavKey[]; /** Pushed out of a full bar into Mais. */ bumped: NavKey | null }
  | { ok: false; reason: 'empty' | 'full' };

/**
 * The bar after a drag: whatever sits above the divider, in order. A fifth item pushes the last
 * other one down to Mais; an empty bar is refused (Mais alone would leave nothing to tap).
 */
export function navFromEditor(items: NavEditorItem[], moved: NavKey): NavChange {
  const divider = items.indexOf(MORE_DIVIDER);
  const bar = (divider === -1 ? items : items.slice(0, divider)).filter(
    (item): item is NavKey => item !== MORE_DIVIDER,
  );
  if (bar.length === 0) return { ok: false, reason: 'empty' };
  if (bar.length <= MAX_NAV_ITEMS) return { ok: true, nav: bar, bumped: null };
  const bumped = [...bar].reverse().find((key) => key !== moved) ?? null;
  return { ok: true, nav: bar.filter((key) => key !== bumped).slice(0, MAX_NAV_ITEMS), bumped };
}

/** The same changes without dragging: up, down, into the bar or out of it. */
export function changeNav(nav: NavKey[], key: NavKey, action: 'up' | 'down' | 'add' | 'remove'): NavChange {
  const index = nav.indexOf(key);
  if (action === 'add') {
    if (index !== -1) return { ok: true, nav, bumped: null };
    if (nav.length >= MAX_NAV_ITEMS) return { ok: false, reason: 'full' };
    return { ok: true, nav: [...nav, key], bumped: null };
  }
  if (action === 'remove') {
    if (index === -1) return { ok: true, nav, bumped: null };
    if (nav.length === 1) return { ok: false, reason: 'empty' };
    return { ok: true, nav: nav.filter((item) => item !== key), bumped: null };
  }
  const target = index + (action === 'up' ? -1 : 1);
  if (index === -1 || target < 0 || target >= nav.length) return { ok: true, nav, bumped: null };
  const next = [...nav];
  [next[index], next[target]] = [next[target], next[index]];
  return { ok: true, nav: next, bumped: null };
}
