import { computeMonthSummary } from '../budget/calculations';
import { currentMonthKey } from '../budget/date';
import { cascadeCarryIn, createMonthData } from '../budget/rollover';
import { createDefaultSettings, createSeedMonthData } from '../budget/seed';
import type { BudgetSettings, Expense, Income, Month, MonthData } from '../budget/types';
import { db, SETTINGS_ID } from './db';
import {
  MonthClosedError,
  MonthNotFoundError,
  type BackupPayload,
  type BudgetRepository,
} from './repository';

/** v1 implementation of BudgetRepository, backed by IndexedDB via Dexie. */
export class IndexedDbBudgetRepository implements BudgetRepository {
  async getSettings(): Promise<BudgetSettings> {
    const existing = await db.settings.get(SETTINGS_ID);
    if (existing) {
      return { topics: existing.topics, specialCategories: existing.specialCategories };
    }
    return this.seedInitialData();
  }

  async saveSettings(settings: BudgetSettings): Promise<void> {
    await db.settings.put({ id: SETTINGS_ID, ...settings });
  }

  async listMonths(): Promise<Month[]> {
    const months = await db.months.toArray();
    return months.map((m) => m.month).sort((a, b) => a.localeCompare(b));
  }

  async getMonth(month: Month): Promise<MonthData | undefined> {
    return db.months.get(month);
  }

  async ensureMonth(month: Month): Promise<MonthData> {
    const existing = await db.months.get(month);
    if (existing) return existing;

    const settings = await this.getSettings();
    const priorMonths = (await db.months.toArray())
      .filter((m) => m.month < month)
      .sort((a, b) => a.month.localeCompare(b.month));
    const previous = priorMonths.at(-1);
    const previousSummary = previous ? computeMonthSummary(previous) : null;

    const created = createMonthData(month, settings.topics, previousSummary);
    await db.months.put(created);
    return created;
  }

  async saveIncome(month: Month, income: Income): Promise<void> {
    const data = await this.requireOpenMonth(month);
    const idx = data.incomes.findIndex((i) => i.id === income.id);
    const incomes =
      idx >= 0 ? data.incomes.map((i, n) => (n === idx ? income : i)) : [...data.incomes, income];
    await db.months.put({ ...data, incomes });
    await this.recascade(month);
  }

  async deleteIncome(month: Month, incomeId: string): Promise<void> {
    const data = await this.requireOpenMonth(month);
    const incomes = data.incomes.filter((i) => i.id !== incomeId);
    await db.months.put({ ...data, incomes });
    await this.recascade(month);
  }

  async saveExpense(month: Month, expense: Expense): Promise<void> {
    const data = await this.requireOpenMonth(month);
    const idx = data.expenses.findIndex((e) => e.id === expense.id);
    const expenses =
      idx >= 0 ? data.expenses.map((e, n) => (n === idx ? expense : e)) : [...data.expenses, expense];
    await db.months.put({ ...data, expenses });
    await this.recascade(month);
  }

  async deleteExpense(month: Month, expenseId: string): Promise<void> {
    const data = await this.requireOpenMonth(month);
    const expenses = data.expenses.filter((e) => e.id !== expenseId);
    await db.months.put({ ...data, expenses });
    await this.recascade(month);
  }

  async closeMonth(month: Month): Promise<void> {
    const data = await this.requireMonth(month);
    await db.months.put({ ...data, closed: true });
  }

  async reopenMonth(month: Month): Promise<void> {
    const data = await this.requireMonth(month);
    await db.months.put({ ...data, closed: false });
    await this.recascade(month);
  }

  async exportData(): Promise<BackupPayload> {
    const settings = await this.getSettings();
    const months = (await db.months.toArray()).sort((a, b) => a.month.localeCompare(b.month));
    return { version: 1, exportedAt: new Date().toISOString(), settings, months };
  }

  async importData(payload: BackupPayload): Promise<void> {
    await db.transaction('rw', db.settings, db.months, async () => {
      await db.settings.clear();
      await db.months.clear();
      await db.settings.put({ id: SETTINGS_ID, ...payload.settings });
      await db.months.bulkPut(payload.months);
    });
  }

  async clearAll(): Promise<void> {
    await db.transaction('rw', db.settings, db.months, async () => {
      await db.settings.clear();
      await db.months.clear();
    });
  }

  private async seedInitialData(): Promise<BudgetSettings> {
    const defaults = createDefaultSettings();
    await db.settings.put({ id: SETTINGS_ID, ...defaults });

    const seedMonth = createSeedMonthData(currentMonthKey(), defaults.topics);
    await db.months.put(seedMonth);

    return defaults;
  }

  private async requireMonth(month: Month): Promise<MonthData> {
    const data = await db.months.get(month);
    if (!data) throw new MonthNotFoundError(month);
    return data;
  }

  private async requireOpenMonth(month: Month): Promise<MonthData> {
    const data = await this.requireMonth(month);
    if (data.closed) throw new MonthClosedError(month);
    return data;
  }

  /** Recomputes carryIn for `fromMonth` onward from each other in cascade, and persists the changes. */
  private async recascade(fromMonth: Month): Promise<void> {
    const chain = (await db.months.toArray())
      .filter((m) => m.month >= fromMonth)
      .sort((a, b) => a.month.localeCompare(b.month));
    if (chain.length === 0) return;

    const updated = cascadeCarryIn(chain, computeMonthSummary);
    await db.months.bulkPut(updated);
  }
}
