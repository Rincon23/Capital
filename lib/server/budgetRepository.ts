import { and, asc, desc, eq, gte, inArray, lt, max, sql, type SQL } from 'drizzle-orm';
import { computeMonthSummary } from '../budget/calculations';
import { DEFAULT_SPECIAL_CATEGORY_LABELS } from '../budget/categories';
import { DEFAULT_SPECIAL_CATEGORY_COLORS } from '../budget/colors';
import { nextMonth } from '../budget/date';
import { cascadeCarryIn, createMonthData } from '../budget/rollover';
import { createDefaultSettings } from '../budget/seed';
import type { BudgetSettings, Expense, Income, Month, MonthData } from '../budget/types';
import {
  BACKUP_VERSION,
  MonthClosedError,
  MonthNotFoundError,
  type BackupPayload,
  type BudgetRepository,
} from '../storage/repository';
import { budgetSettings, expenses, incomes, months } from './db/schema';
import type { Database, Transaction } from './db/types';

/** The database or an open transaction: both run the same queries. */
type Executor = Database | Transaction;

type MonthRow = typeof months.$inferSelect;
type IncomeRow = typeof incomes.$inferSelect;
type ExpenseRow = typeof expenses.$inferSelect;

/** Rows per INSERT when writing many entries at once (keeps well under Postgres' parameter limit). */
const INSERT_CHUNK = 500;

function toIncome(row: IncomeRow): Income {
  const income: Income = { id: row.id, source: row.source, amount: row.amount };
  if (row.date) income.date = row.date;
  return income;
}

function toExpense(row: ExpenseRow): Expense {
  const expense: Expense = {
    id: row.id,
    categoryKind: row.categoryKind,
    description: row.description,
    amount: row.amount,
    date: row.date,
    singleInstallmentCard: row.card,
  };
  if (row.topicId) expense.topicId = row.topicId;
  return expense;
}

function groupByMonth<T extends { month: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.month);
    if (list) list.push(row);
    else grouped.set(row.month, [row]);
  }
  return grouped;
}

function chunks<T>(list: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size));
  return result;
}

/**
 * BudgetRepository on Postgres, scoped to one user: every write to a month re-cascades
 * carryIn for the later months, writes to a closed month are rejected, and the default
 * envelopes are seeded on first read. Each month is stored as a `months` row plus its `incomes` and
 * `expenses` rows, and read back as the exact `MonthData` shape.
 *
 * Every write runs in a transaction holding a per-user advisory lock, so concurrent writes
 * (two devices, later the worker and voice entries) apply one after the other and the
 * carryIn cascade always works on the latest data.
 */
export class PostgresBudgetRepository implements BudgetRepository {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  async getSettings(): Promise<BudgetSettings> {
    return this.settingsIn(this.db);
  }

  async saveSettings(settings: BudgetSettings): Promise<void> {
    await this.upsertSettings(this.db, settings, false);
  }

  /** Marks this account as having finished (or skipped) the new-user wizard/tour, for good. */
  async completeOnboarding(): Promise<void> {
    await this.db
      .update(budgetSettings)
      .set({ onboardingCompleted: true })
      .where(eq(budgetSettings.userId, this.userId));
  }

  // -------------------------------------------------------------------------
  // Months (reads)
  // -------------------------------------------------------------------------

  async listMonths(): Promise<Month[]> {
    const rows = await this.db
      .select({ month: months.month })
      .from(months)
      .where(eq(months.userId, this.userId))
      .orderBy(asc(months.month));
    return rows.map((row) => row.month);
  }

  async getMonth(month: Month): Promise<MonthData | undefined> {
    const [data] = await this.loadMonths(this.db, eq(months.month, month));
    return data;
  }

  async peekMonth(month: Month): Promise<MonthData> {
    return (await this.getMonth(month)) ?? this.buildMonth(this.db, month);
  }

  async ensureMonth(month: Month): Promise<MonthData> {
    return (await this.getMonth(month)) ?? this.write((tx) => this.ensureMonthIn(tx, month));
  }

  // -------------------------------------------------------------------------
  // Entries
  // -------------------------------------------------------------------------

  async saveIncome(month: Month, income: Income): Promise<void> {
    await this.write(async (tx) => {
      await this.ensureOpenMonthIn(tx, month);
      const values = {
        month,
        source: income.source,
        amount: income.amount,
        date: income.date || null,
      };
      const [last] = await tx
        .select({ position: max(incomes.position) })
        .from(incomes)
        .where(and(eq(incomes.userId, this.userId), eq(incomes.month, month)));
      await tx
        .insert(incomes)
        .values({ userId: this.userId, id: income.id, position: (last?.position ?? -1) + 1, ...values })
        .onConflictDoUpdate({ target: [incomes.userId, incomes.id], set: values });
      await this.recascade(tx, month);
    });
  }

  async deleteIncome(month: Month, incomeId: string): Promise<void> {
    await this.write(async (tx) => {
      await this.requireOpenMonthIn(tx, month);
      await tx
        .delete(incomes)
        .where(
          and(eq(incomes.userId, this.userId), eq(incomes.month, month), eq(incomes.id, incomeId)),
        );
      await this.recascade(tx, month);
    });
  }

  async saveExpense(month: Month, expense: Expense): Promise<void> {
    await this.write(async (tx) => {
      await this.ensureOpenMonthIn(tx, month);
      const values = {
        month,
        categoryKind: expense.categoryKind,
        topicId: expense.topicId ?? null,
        description: expense.description,
        amount: expense.amount,
        date: expense.date,
        card: expense.singleInstallmentCard === true,
      };
      const [last] = await tx
        .select({ position: max(expenses.position) })
        .from(expenses)
        .where(and(eq(expenses.userId, this.userId), eq(expenses.month, month)));
      await tx
        .insert(expenses)
        .values({ userId: this.userId, id: expense.id, position: (last?.position ?? -1) + 1, ...values })
        .onConflictDoUpdate({ target: [expenses.userId, expenses.id], set: values });
      await this.recascade(tx, month);
    });
  }

  async deleteExpense(month: Month, expenseId: string): Promise<void> {
    await this.write(async (tx) => {
      await this.requireOpenMonthIn(tx, month);
      await tx
        .delete(expenses)
        .where(
          and(
            eq(expenses.userId, this.userId),
            eq(expenses.month, month),
            eq(expenses.id, expenseId),
          ),
        );
      await this.recascade(tx, month);
    });
  }

  // -------------------------------------------------------------------------
  // Month lifecycle
  // -------------------------------------------------------------------------

  async closeMonth(month: Month, openNext = false): Promise<void> {
    await this.write(async (tx) => {
      await this.ensureMonthIn(tx, month);
      await tx.update(months).set({ closed: true, closedAt: new Date() }).where(this.monthKey(month));
      // "Fechar mês" closes and opens in one go: the next month is created inside this same
      // transaction, already carrying each envelope's leftover from the month just closed.
      if (openNext) await this.ensureMonthIn(tx, nextMonth(month));
    });
  }

  async reopenMonth(month: Month): Promise<void> {
    await this.write(async (tx) => {
      if (!(await this.monthRow(tx, month))) throw new MonthNotFoundError(month);
      await tx.update(months).set({ closed: false, closedAt: null }).where(this.monthKey(month));
      await this.recascade(tx, month);
    });
  }

  async deleteMonth(month: Month): Promise<void> {
    await this.write(async (tx) => {
      const deleted = await tx
        .delete(months)
        .where(this.monthKey(month))
        .returning({ month: months.month });
      if (deleted.length === 0) return;

      // A month before the deleted one feeds the months after it: cascade from there.
      const [previous] = await tx
        .select({ month: months.month })
        .from(months)
        .where(and(eq(months.userId, this.userId), lt(months.month, month)))
        .orderBy(desc(months.month))
        .limit(1);
      if (previous) {
        await this.recascade(tx, previous.month);
        return;
      }

      // The deleted month was the earliest: the new earliest has nothing before it, so its
      // carryIn drops to zero before cascading forward.
      const [earliest] = await tx
        .select()
        .from(months)
        .where(eq(months.userId, this.userId))
        .orderBy(asc(months.month))
        .limit(1);
      if (!earliest) return;
      const zeroCarryIn = Object.fromEntries(earliest.topicsSnapshot.map((t) => [t.id, 0]));
      await tx.update(months).set({ carryIn: zeroCarryIn }).where(this.monthKey(earliest.month));
      await this.recascade(tx, earliest.month);
    });
  }

  // -------------------------------------------------------------------------
  // Backup
  // -------------------------------------------------------------------------

  async exportData(): Promise<BackupPayload> {
    const settings = await this.getSettings();
    const allMonths = await this.loadMonths(this.db);
    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
      months: allMonths,
    };
  }

  /** Replaces all of this account's data with the backup (settings, including the onboarding flag, and every month). */
  async importData(payload: BackupPayload): Promise<void> {
    await this.write(async (tx) => {
      await tx.delete(months).where(eq(months.userId, this.userId));
      await this.upsertSettings(tx, payload.settings, true);
      await this.insertMonths(tx, payload.months);
    });
  }

  async clearAll(): Promise<void> {
    await this.write(async (tx) => {
      await tx.delete(months).where(eq(months.userId, this.userId));
      await tx.delete(budgetSettings).where(eq(budgetSettings.userId, this.userId));
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Runs `fn` in a transaction holding this user's advisory lock (released at commit/rollback). */
  private write<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${this.userId}, 0))`);
      return fn(tx);
    });
  }

  private monthKey(month: Month): SQL {
    return and(eq(months.userId, this.userId), eq(months.month, month)) as SQL;
  }

  private async monthRow(ex: Executor, month: Month): Promise<MonthRow | undefined> {
    const [row] = await ex.select().from(months).where(this.monthKey(month));
    return row;
  }

  private async requireOpenMonthIn(tx: Transaction, month: Month): Promise<void> {
    const row = await this.monthRow(tx, month);
    if (!row) throw new MonthNotFoundError(month);
    if (row.closed) throw new MonthClosedError(month);
  }

  /** Like `requireOpenMonthIn`, but creates and persists the month first if it doesn't exist yet. */
  private async ensureOpenMonthIn(tx: Transaction, month: Month): Promise<void> {
    const row = await this.monthRow(tx, month);
    if (row?.closed) throw new MonthClosedError(month);
    if (!row) await this.ensureMonthIn(tx, month);
  }

  private async ensureMonthIn(tx: Transaction, month: Month): Promise<MonthData> {
    const [existing] = await this.loadMonths(tx, eq(months.month, month));
    if (existing) return existing;

    const created = await this.buildMonth(tx, month);
    await tx
      .insert(months)
      .values({
        userId: this.userId,
        month,
        carryIn: created.carryIn,
        topicsSnapshot: created.topicsSnapshot,
      })
      .onConflictDoNothing();
    return created;
  }

  /** Computes a fresh month (rollover carryIn from the latest prior month) without persisting it. */
  private async buildMonth(ex: Executor, month: Month): Promise<MonthData> {
    const settings = await this.settingsIn(ex);
    const [prior] = await ex
      .select({ month: months.month })
      .from(months)
      .where(and(eq(months.userId, this.userId), lt(months.month, month)))
      .orderBy(desc(months.month))
      .limit(1);
    const [previous] = prior ? await this.loadMonths(ex, eq(months.month, prior.month)) : [];
    return createMonthData(month, settings.topics, previous ? computeMonthSummary(previous) : null);
  }

  /** This user's months matching `filter` (all of them without one), oldest first, with their entries. */
  private async loadMonths(ex: Executor, filter?: SQL): Promise<MonthData[]> {
    const rows = await ex
      .select()
      .from(months)
      .where(and(eq(months.userId, this.userId), filter))
      .orderBy(asc(months.month));
    if (rows.length === 0) return [];

    const keys = rows.map((row) => row.month);
    const incomeRows = await ex
      .select()
      .from(incomes)
      .where(and(eq(incomes.userId, this.userId), inArray(incomes.month, keys)))
      .orderBy(asc(incomes.position));
    const expenseRows = await ex
      .select()
      .from(expenses)
      .where(and(eq(expenses.userId, this.userId), inArray(expenses.month, keys)))
      .orderBy(asc(expenses.position));

    const incomesByMonth = groupByMonth(incomeRows);
    const expensesByMonth = groupByMonth(expenseRows);
    return rows.map((row) => ({
      month: row.month,
      incomes: (incomesByMonth.get(row.month) ?? []).map(toIncome),
      expenses: (expensesByMonth.get(row.month) ?? []).map(toExpense),
      carryIn: row.carryIn,
      topicsSnapshot: row.topicsSnapshot,
      closed: row.closed,
    }));
  }

  /** Recomputes carryIn for `fromMonth` onward in cascade and persists what changed. */
  private async recascade(tx: Transaction, fromMonth: Month): Promise<void> {
    const chain = await this.loadMonths(tx, gte(months.month, fromMonth));
    if (chain.length === 0) return;

    const updated = cascadeCarryIn(chain, computeMonthSummary);
    for (let i = 0; i < updated.length; i++) {
      if (JSON.stringify(updated[i].carryIn) === JSON.stringify(chain[i].carryIn)) continue;
      await tx
        .update(months)
        .set({ carryIn: updated[i].carryIn })
        .where(this.monthKey(updated[i].month));
    }
  }

  private async settingsIn(ex: Executor): Promise<BudgetSettings> {
    const existing = await this.readSettings(ex);
    if (existing) return existing;

    // First read for this account: seed the default envelopes (no demo month). Only this
    // first-ever row is created with the onboarding still pending.
    const defaults = createDefaultSettings();
    await ex
      .insert(budgetSettings)
      .values({
        userId: this.userId,
        topics: defaults.topics,
        specialCategories: defaults.specialCategories,
        specialCategoryColors: defaults.specialCategoryColors ?? {},
        modules: defaults.modules ?? {},
        onboardingCompleted: false,
      })
      .onConflictDoNothing();

    const seeded = await this.readSettings(ex);
    if (!seeded) throw new Error('Não foi possível inicializar as configurações.');
    return seeded;
  }

  private async readSettings(ex: Executor): Promise<BudgetSettings | undefined> {
    const [row] = await ex
      .select()
      .from(budgetSettings)
      .where(eq(budgetSettings.userId, this.userId));
    if (!row) return undefined;
    return {
      topics: row.topics,
      // Rows written before a label/color/module existed get the default for it.
      specialCategories: { ...DEFAULT_SPECIAL_CATEGORY_LABELS, ...row.specialCategories },
      specialCategoryColors: { ...DEFAULT_SPECIAL_CATEGORY_COLORS, ...row.specialCategoryColors },
      onboardingCompleted: row.onboardingCompleted,
      modules: row.modules,
    };
  }

  /**
   * Saving settings from the app never touches the onboarding flag (only `completeOnboarding`
   * does), and leaves the modules alone unless the payload actually carries them — an older
   * client (a cached bundle that predates the modules) must not switch them all off. Restoring
   * a backup replaces both, along with everything else.
   */
  private async upsertSettings(
    ex: Executor,
    settings: BudgetSettings,
    restoringBackup: boolean,
  ): Promise<void> {
    const values = {
      topics: settings.topics,
      specialCategories: settings.specialCategories,
      specialCategoryColors: settings.specialCategoryColors ?? {},
      ...(restoringBackup
        ? { modules: settings.modules ?? {} }
        : settings.modules !== undefined
          ? { modules: settings.modules }
          : {}),
      ...(restoringBackup && settings.onboardingCompleted !== undefined
        ? { onboardingCompleted: settings.onboardingCompleted }
        : {}),
    };
    await ex
      .insert(budgetSettings)
      .values({ userId: this.userId, ...values })
      .onConflictDoUpdate({ target: budgetSettings.userId, set: values });
  }

  /** Inserts whole months (row + entries, keeping each list's order). */
  private async insertMonths(tx: Transaction, list: MonthData[]): Promise<void> {
    if (list.length === 0) return;

    await tx.insert(months).values(
      list.map((m) => ({
        userId: this.userId,
        month: m.month,
        carryIn: m.carryIn,
        topicsSnapshot: m.topicsSnapshot,
        closed: m.closed ?? false,
        closedAt: m.closed ? new Date() : null,
      })),
    );

    const incomeRows = list.flatMap((m) =>
      m.incomes.map((income, position) => ({
        userId: this.userId,
        id: income.id,
        month: m.month,
        source: income.source,
        amount: income.amount,
        date: income.date || null,
        position,
      })),
    );
    for (const chunk of chunks(incomeRows, INSERT_CHUNK)) await tx.insert(incomes).values(chunk);

    const expenseRows = list.flatMap((m) =>
      m.expenses.map((expense, position) => ({
        userId: this.userId,
        id: expense.id,
        month: m.month,
        categoryKind: expense.categoryKind,
        topicId: expense.topicId ?? null,
        description: expense.description,
        amount: expense.amount,
        date: expense.date,
        card: expense.singleInstallmentCard === true,
        position,
      })),
    );
    for (const chunk of chunks(expenseRows, INSERT_CHUNK)) await tx.insert(expenses).values(chunk);
  }
}
