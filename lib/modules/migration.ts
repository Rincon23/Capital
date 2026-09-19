import type { BudgetSettings, ModuleKey, NavKey } from '../budget/types';

/**
 * The card modules merged into one. "Cartão de crédito" (the card question), "Cartões" (the
 * registered cards and their bills) and "Parcelados" were three modules with three screens for
 * what is, to the person using it, a single thing: the card. They are now the module `card`,
 * with the screen `/cartao`.
 *
 * Nobody loses anything in the move: whoever had any of the old ones on ends up with Cartão on,
 * and wherever the old keys were saved — the bottom bar, the order of the Início cards — they
 * become `card`, in the same place, without ever appearing twice.
 */

/** The keys that no longer exist, and what they became. */
export const MERGED_CARD_MODULES = ['cards', 'installments'] as const;

export type MergedCardModule = (typeof MERGED_CARD_MODULES)[number];

function isMerged(key: string): key is MergedCardModule {
  return (MERGED_CARD_MODULES as readonly string[]).includes(key);
}

/** Replaces the old keys with `card`, keeping the first position and dropping the repeats. */
function mergeList<T extends string>(list: T[]): T[] {
  const merged: T[] = [];
  for (const key of list) {
    const next = (isMerged(key) ? 'card' : key) as T;
    if (!merged.includes(next)) merged.push(next);
  }
  return merged;
}

export interface CardModuleMigration {
  modules: Partial<Record<string, boolean>>;
  nav: NavKey[] | null;
  homeOrder: ModuleKey[] | null;
  /** False when this account had nothing from before: no write is needed. */
  changed: boolean;
}

/**
 * What one account's settings become. Idempotent: an account already migrated (or one that
 * never used the old modules) comes back with `changed: false` and nothing touched.
 */
export function migrateCardModule(
  settings: Pick<BudgetSettings, 'modules' | 'nav' | 'homeOrder'>,
): CardModuleMigration {
  const stored: Record<string, boolean | undefined> = { ...(settings.modules ?? {}) };
  const hadOld = MERGED_CARD_MODULES.some((key) => key in stored);
  const modules: Partial<Record<string, boolean>> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!isMerged(key)) modules[key] = value;
  }
  // Whoever had Cartões or Parcelados on gets Cartão on — they were already using it.
  if (MERGED_CARD_MODULES.some((key) => stored[key] === true)) modules.card = true;

  const nav = settings.nav ? mergeList(settings.nav) : null;
  const homeOrder = settings.homeOrder ? mergeList(settings.homeOrder) : null;
  const changed =
    hadOld ||
    JSON.stringify(nav) !== JSON.stringify(settings.nav ?? null) ||
    JSON.stringify(homeOrder) !== JSON.stringify(settings.homeOrder ?? null);

  return { modules, nav, homeOrder, changed };
}
