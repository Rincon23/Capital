export * from './repository';
export * from './wallet';
export * from './indexedDbRepository';
export * from './httpRepository';
export * from './walletHttpRepository';
export * from './preferences';
export * from './exportImport';

import type { BudgetRepository } from './repository';
import { HttpBudgetRepository } from './httpRepository';
import type { WalletRepository } from './wallet';
import { HttpWalletRepository } from './walletHttpRepository';

/**
 * Singleton repository used throughout the app: the app's own API (Postgres on the server,
 * scoped to the signed-in user). `IndexedDbBudgetRepository` is still exported for the
 * one-time migration of a device's old local data (see `lib/storage/localMigration.ts`).
 */
export const budgetRepository: BudgetRepository = new HttpBudgetRepository();

/** Same idea for the Carteira (gastos recorrentes, parcelados, reserva investida e caixa). */
export const walletRepository: WalletRepository = new HttpWalletRepository();
