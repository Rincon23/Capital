export * from './repository';
export * from './indexedDbRepository';
export * from './supabaseRepository';
export * from './preferences';
export * from './exportImport';

import type { BudgetRepository } from './repository';
import { SupabaseBudgetRepository } from './supabaseRepository';

/**
 * Singleton repository used throughout the app. v2 is cloud-backed (Supabase +
 * per-user RLS); `IndexedDbBudgetRepository` is still exported for the one-time
 * migration of a device's old local data (see `lib/storage/localMigration.ts`).
 */
export const budgetRepository: BudgetRepository = new SupabaseBudgetRepository();
