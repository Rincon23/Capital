import type { BudgetSettings, HomeWidgetKey, ModuleKey } from '../budget/types';
import { MODULES, MODULE_KEYS, moduleDefinition } from './catalog';
import { wantsFirstSteps } from './firstSteps';
import { parentOf, resolveModules } from './flags';

/** How many áreas de trabalho the Início can have, side by side like a phone's home screen. */
export const MAX_HOME_PAGES = 5;
/** A cap for what is saved, not a real limit: a page scrolls, and every widget fits in one. */
export const MAX_WIDGETS_PER_HOME_PAGE = 50;

/** The áreas de trabalho, in order, each with its widgets in order. */
export type HomePages = HomeWidgetKey[][];

/**
 * The widgets a module brings to the Início besides its own card. They come right after the card,
 * except a `first` one, which goes at the top of the first área.
 */
export const EXTRA_HOME_WIDGETS: { key: Exclude<HomeWidgetKey, ModuleKey>; module: ModuleKey; first?: boolean }[] = [
  { key: 'calendar', module: 'reminders' },
  // A new account's "Primeiros passos", only until the three are done (see `wantsFirstSteps`).
  { key: 'firstSteps', module: 'budget', first: true },
];

/** Every widget the Início knows: the card of each module, then the extra ones. */
export const HOME_WIDGET_KEYS: HomeWidgetKey[] = [
  ...MODULE_KEYS,
  ...EXTRA_HOME_WIDGETS.map(({ key }) => key),
];

/** The module a widget belongs to: it is there while that module is on. */
export function widgetModule(key: HomeWidgetKey): ModuleKey {
  return EXTRA_HOME_WIDGETS.find((widget) => widget.key === key)?.module ?? (key as ModuleKey);
}

/** How a widget is called where the module's name alone would be ambiguous (the widget tray). */
const WIDGET_TEXT: Partial<Record<HomeWidgetKey, { name: string; description: string }>> = {
  reminders: { name: 'Lembretes de hoje', description: 'O que falta fazer hoje, com o botão de feito.' },
  calendar: { name: 'Calendário', description: 'Hoje e os próximos 30 dias, com os compromissos marcados.' },
  firstSteps: { name: 'Primeiros passos', description: 'Renda, primeiro gasto e quanto ainda dá para gastar.' },
};

export function widgetName(key: HomeWidgetKey): string {
  return WIDGET_TEXT[key]?.name ?? moduleDefinition(widgetModule(key)).name;
}

export function widgetDescription(key: HomeWidgetKey): string {
  return WIDGET_TEXT[key]?.description ?? moduleDefinition(widgetModule(key)).tagline;
}

type ModulesSource =
  | (Pick<BudgetSettings, 'modules'> & Partial<Pick<BudgetSettings, 'dismissedNotices'>>)
  | null
  | undefined;

/** A module's card and, right after it, the extra widgets it brings (not the `first` ones). */
function withExtras(key: ModuleKey): HomeWidgetKey[] {
  return [
    key,
    ...EXTRA_HOME_WIDGETS.filter((widget) => widget.module === key && !widget.first).map(({ key }) => key),
  ];
}

const isFirstWidget = (key: HomeWidgetKey) => EXTRA_HOME_WIDGETS.some((widget) => widget.key === key && widget.first);

/**
 * Every widget the Início can have right now, in the default order: catalog order. A module
 * without a screen (the card bill, "A receber") comes right after the module it hangs from, and a
 * module's extra widgets (the calendar) right after its card. "Primeiros passos" comes before
 * everything, while the account has it.
 */
export function homeCards(source: ModulesSource): HomeWidgetKey[] {
  const modules = resolveModules(source);
  const order: ModuleKey[] = [];
  const place = (key: ModuleKey) => {
    order.push(key);
    // Screenless children follow their parent (and their own children follow them).
    for (const m of MODULES) {
      if (!m.screen && m.homeCard && modules[m.key] && parentOf(m.key) === key) place(m.key);
    }
  };
  for (const m of MODULES) if (m.screen && modules[m.key]) place(m.key);
  for (const m of MODULES) {
    if (!m.screen && m.homeCard && modules[m.key] && !order.includes(m.key)) place(m.key);
  }
  const first = EXTRA_HOME_WIDGETS.filter(
    (widget) => widget.first && modules[widget.module] && (widget.key !== 'firstSteps' || wantsFirstSteps(source)),
  ).map(({ key }) => key);
  return [...first, ...order.filter((key) => moduleDefinition(key).homeCard).flatMap(withExtras)];
}

type HomeSource =
  | (Pick<BudgetSettings, 'modules'> &
      Partial<Pick<BudgetSettings, 'homePages' | 'homeOrder' | 'homeHidden' | 'dismissedNotices'>>)
  | null
  | undefined;

/** The pages without the empty ones, but never zero pages: the Início always has its first. */
export function withoutEmptyPages(pages: HomePages): HomePages {
  const kept = pages.filter((page) => page.length > 0).map((page) => [...page]);
  return kept.length > 0 ? kept : [[]];
}

/**
 * The áreas de trabalho as they are shown: what the user arranged (`homePages`; an Início saved
 * before there were pages, `homeOrder`, counts as one page), kept in step with the modules that
 * are actually on. A widget that is no longer available drops out, a repeat stays only where it
 * first appears, whatever was taken off (`homeHidden`) is left out, and empty pages go. Anything
 * new comes in by itself: an extra widget right after the card of its module, in whichever page
 * that card is, a `first` one at the top of the first page, anything else at the end of the last
 * page. Nothing saved: one page, default order.
 */
export function resolveHomePages(source: HomeSource): HomePages {
  const base = homeCards(source);
  const hidden = new Set(source?.homeHidden ?? []);
  const saved = source?.homePages ?? (source?.homeOrder ? [source.homeOrder] : null);
  if (!saved) return [base.filter((key) => !hidden.has(key))];

  const placed = new Set<HomeWidgetKey>();
  const pages = withoutEmptyPages(
    saved.slice(0, MAX_HOME_PAGES).map((page) =>
      page.filter((key) => {
        if (!base.includes(key) || hidden.has(key) || placed.has(key)) return false;
        placed.add(key);
        return true;
      }),
    ),
  );

  for (const key of base) {
    if (placed.has(key) || hidden.has(key)) continue;
    placed.add(key);
    if (isFirstWidget(key)) {
      pages[0].unshift(key);
      continue;
    }
    const owner = widgetModule(key);
    const ownerPage = key === owner ? -1 : pages.findIndex((page) => page.includes(owner));
    if (ownerPage === -1) pages[pages.length - 1].push(key);
    else pages[ownerPage].splice(pages[ownerPage].indexOf(owner) + 1, 0, key);
  }
  return pages;
}

/** The widgets the user took off the Início that could come back now (the widget tray). */
export function hiddenHomeCards(source: HomeSource): HomeWidgetKey[] {
  const hidden = source?.homeHidden ?? [];
  return homeCards(source).filter((key) => hidden.includes(key));
}

/** The widgets of the modules that are off, in catalog order: they come once the module is on. */
export function offModuleWidgets(source: ModulesSource): HomeWidgetKey[] {
  const modules = resolveModules(source);
  return MODULES.filter((m) => m.homeCard && !modules[m.key]).flatMap((m) => withExtras(m.key));
}

/** The page a widget is in, or -1. */
export function pageOfWidget(pages: HomePages, key: HomeWidgetKey): number {
  return pages.findIndex((page) => page.includes(key));
}

/** Takes a widget off every page. Empty pages stay: edit mode removes them when it closes. */
export function removeWidget(pages: HomePages, key: HomeWidgetKey): HomePages {
  return pages.map((page) => page.filter((item) => item !== key));
}

/**
 * Puts a widget at `index` of page `page` (the position it ends up in), out of wherever it was.
 * `page` one past the last creates a new page, unless the Início already has the most it can.
 * Within one page this is `arrayMove`.
 */
export function moveWidget(pages: HomePages, key: HomeWidgetKey, page: number, index: number): HomePages {
  const creating = page >= pages.length;
  if (creating && pages.length >= MAX_HOME_PAGES) return pages;
  const next = removeWidget(pages, key);
  if (creating) next.push([]);
  const target = next[Math.max(0, Math.min(page, next.length - 1))];
  target.splice(Math.max(0, Math.min(index, target.length)), 0, key);
  return next;
}

/** Puts a widget at the end of page `page` (one past the last: a new page). */
export function addWidget(pages: HomePages, key: HomeWidgetKey, page: number): HomePages {
  const length = page < pages.length ? pages[page].filter((item) => item !== key).length : 0;
  return moveWidget(pages, key, page, length);
}

/** A new, empty page at the end; null when the Início already has `MAX_HOME_PAGES`. */
export function addHomePage(pages: HomePages): HomePages | null {
  return pages.length >= MAX_HOME_PAGES ? null : [...pages.map((page) => [...page]), []];
}

/**
 * Deletes a page without losing anything on it: a widget only leaves the Início by its own "−".
 * Its widgets go to the end of the page before it (the first page's, to the next one); `movedTo`
 * is that page in the result, or -1 when the page was empty. The only page cannot be deleted.
 */
export function deleteHomePage(pages: HomePages, index: number): { pages: HomePages; movedTo: number } {
  const copy = pages.map((page) => [...page]);
  if (copy.length <= 1 || !copy[index]) return { pages: copy, movedTo: -1 };
  const [widgets] = copy.splice(index, 1);
  const movedTo = widgets.length > 0 ? Math.max(0, index - 1) : -1;
  if (movedTo !== -1) copy[movedTo].push(...widgets);
  return { pages: copy, movedTo };
}
