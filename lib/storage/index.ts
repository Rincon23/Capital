export * from './repository';
export * from './indexedDbRepository';
export * from './httpRepository';
export * from './preferences';
export * from './exportImport';

import type { BudgetRepository } from './repository';
import { HttpBudgetRepository } from './httpRepository';

/**
 * Singleton repository used throughout the app: the app's own API (Postgres on the server,
 * scoped to the signed-in user). `IndexedDbBudgetRepository` is still exported for the
 * one-time migration of a device's old local data (see `lib/storage/localMigration.ts`).
 */
export const budgetRepository: BudgetRepository = new HttpBudgetRepository();
