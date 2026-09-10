import type { BudgetSettings, Expense, Income, Month, MonthData } from '../budget/types';

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  settings: BudgetSettings;
  months: MonthData[];
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

  listMonths(): Promise<Month[]>;
  getMonth(month: Month): Promise<MonthData | undefined>;
  /** Returns the month's data, creating it (with rollover carryIn from the latest prior month) if it doesn't exist yet. */
  ensureMonth(month: Month): Promise<MonthData>;

  saveIncome(month: Month, income: Income): Promise<void>;
  deleteIncome(month: Month, incomeId: string): Promise<void>;

  saveExpense(month: Month, expense: Expense): Promise<void>;
  deleteExpense(month: Month, expenseId: string): Promise<void>;

  closeMonth(month: Month): Promise<void>;
  /** Reopens a closed month and recomputes carryIn for every later month that already exists. */
  reopenMonth(month: Month): Promise<void>;

  exportData(): Promise<BackupPayload>;
  importData(payload: BackupPayload): Promise<void>;
  clearAll(): Promise<void>;
}
