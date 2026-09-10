export * from './repository';
export * from './indexedDbRepository';
export * from './preferences';
export * from './exportImport';

import { IndexedDbBudgetRepository } from './indexedDbRepository';
import type { BudgetRepository } from './repository';

/** Singleton repository instance used throughout the app. Swap this for a v2 backend without touching callers. */
export const budgetRepository: BudgetRepository = new IndexedDbBudgetRepository();
