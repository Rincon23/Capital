import type { BudgetSettings, Expense, Income, Month, MonthData } from '../budget/types';

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  settings: BudgetSettings;
  months: MonthData[];
}

/** Thrown when a write targets a month that has been closed. Message is user-facing (pt-BR). */
export class MonthClosedError extends Error {
  constructor(month: Month) {
    super(`O mês ${month} está fechado. Reabra-o para editar.`);
    this.name = 'MonthClosedError';
  }
}

/** Thrown when an operation references a month that does not exist yet. */
export class MonthNotFoundError extends Error {
  constructor(month: Month) {
    super(`O mês ${month} não foi encontrado.`);
    this.name = 'MonthNotFoundError';
  }
}

/** Thrown by cloud-backed repositories when there is no signed-in user. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('Sessão expirada. Entre novamente para continuar.');
    this.name = 'NotAuthenticatedError';
  }
}

/**
 * Storage-agnostic interface for all budget data access. The UI and the
 * pure calculation modules never talk to IndexedDB (or any future backend)
 * directly — they only depend on this contract. v1 ships
 * `IndexedDbBudgetRepository`; a v2 cloud backend (e.g. Supabase) would add
 * a `SupabaseBudgetRepository` implementing the same interface, with no
 * changes to business logic or components.
 */
export interface BudgetRepository {
  getSettings(): Promise<BudgetSettings>;
  saveSettings(settings: BudgetSettings): Promise<void>;
  /** Marks this account as having finished (or skipped) the new-user wizard/tour, for good. */
  completeOnboarding(): Promise<void>;

  listMonths(): Promise<Month[]>;
  getMonth(month: Month): Promise<MonthData | undefined>;
  /**
   * Returns the month's data if it already exists, otherwise a computed preview
   * (with rollover carryIn from the latest prior month) that is NOT persisted.
   * Used when merely navigating to a month, so browsing the calendar never
   * litters storage with empty months.
   */
  peekMonth(month: Month): Promise<MonthData>;
  /** Returns the month's data, creating and persisting it (with rollover carryIn from the latest prior month) if it doesn't exist yet. */
  ensureMonth(month: Month): Promise<MonthData>;

  saveIncome(month: Month, income: Income): Promise<void>;
  deleteIncome(month: Month, incomeId: string): Promise<void>;

  saveExpense(month: Month, expense: Expense): Promise<void>;
  deleteExpense(month: Month, expenseId: string): Promise<void>;

  closeMonth(month: Month): Promise<void>;
  /** Reopens a closed month and recomputes carryIn for every later month that already exists. */
  reopenMonth(month: Month): Promise<void>;
  /** Permanently deletes a stored month and recomputes carryIn for every later month. No-op if the month was never persisted. */
  deleteMonth(month: Month): Promise<void>;

  exportData(): Promise<BackupPayload>;
  importData(payload: BackupPayload): Promise<void>;
  clearAll(): Promise<void>;
}
