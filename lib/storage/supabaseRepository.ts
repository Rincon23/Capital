import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { computeMonthSummary } from '../budget/calculations';
import { cascadeCarryIn, createMonthData } from '../budget/rollover';
import { createDefaultSettings } from '../budget/seed';
import type { BudgetSettings, Expense, Income, Month, MonthData } from '../budget/types';
import type { Database, MonthInsert, MonthRow } from '../supabase/database.types';
import { getSupabaseBrowserClient } from '../supabase/client';
import {
  MonthClosedError,
  MonthNotFoundError,
  NotAuthenticatedError,
  type BackupPayload,
  type BudgetRepository,
} from './repository';

/** Postgres SQLSTATE for a unique-constraint violation (two tabs racing to seed). */
const UNIQUE_VIOLATION = '23505';

/** A real Error (so `instanceof Error` works downstream) that carries the PostgREST code. */
export class SupabaseStorageError extends Error {
  readonly code?: string;
  constructor(source: { message?: string; code?: string }) {
    super(source.message || 'Erro ao acessar o Supabase.');
    this.name = 'SupabaseStorageError';
    this.code = source.code;
  }
}

/** Awaits a supabase-js builder and throws a real Error on failure instead of returning `{ error }`. */
async function run<T>(
  builder: PromiseLike<{ data: T; error: PostgrestError | null }>,
): Promise<T> {
  const { data, error } = await builder;
  if (error) throw new SupabaseStorageError(error);
  return data;
}

function rowToMonthData(row: MonthRow): MonthData {
  return {
    month: row.month,
    incomes: row.incomes ?? [],
    expenses: row.expenses ?? [],
    carryIn: row.carry_in ?? {},
    topicsSnapshot: row.topics_snapshot ?? [],
    closed: row.closed,
  };
}

function monthDataToInsert(data: MonthData, userId: string): MonthInsert & { user_id: string } {
  return {
    user_id: userId,
    month: data.month,
    incomes: data.incomes,
    expenses: data.expenses,
    carry_in: data.carryIn,
    topics_snapshot: data.topicsSnapshot,
    closed: data.closed ?? false,
  };
}

/**
 * Cloud implementation of BudgetRepository, backed by Supabase Postgres. Same
 * method contract and semantics as IndexedDbBudgetRepository — every write to a
 * month re-cascades `carryIn` for the later months, writes to a closed month are
 * rejected, and the default envelopes are seeded on first read.
 *
 * Row access is enforced by RLS (`auth.uid() = user_id`). `user_id` is always
 * sent explicitly (not left to the column default) so inserts don't depend on
 * `auth.uid()` resolving inside a DEFAULT expression.
 */
export class SupabaseBudgetRepository implements BudgetRepository {
  constructor(
    private readonly getClient: () => SupabaseClient<Database> = getSupabaseBrowserClient,
  ) {}

  private get client(): SupabaseClient<Database> {
    return this.getClient();
  }

  private async requireUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getClaims();
    const sub = data?.claims?.sub;
    if (error || !sub) throw new NotAuthenticatedError();
    return sub;
  }

  async getSettings(): Promise<BudgetSettings> {
    const existing = await run(
      this.client.from('budget_settings').select('topics, special_categories').maybeSingle(),
    );
    if (existing) {
      return { topics: existing.topics, specialCategories: existing.special_categories };
    }

    // First read for this account: seed the default envelopes (no demo month).
    const userId = await this.requireUserId();
    const defaults = createDefaultSettings();
    const { error } = await this.client.from('budget_settings').insert({
      user_id: userId,
      topics: defaults.topics,
      special_categories: defaults.specialCategories,
    });
    // 23505 = another tab seeded first; fall through to the re-read.
    if (error && error.code !== UNIQUE_VIOLATION) throw new SupabaseStorageError(error);

    const seeded = await run(
      this.client.from('budget_settings').select('topics, special_categories').maybeSingle(),
    );
    if (!seeded) throw new Error('Não foi possível inicializar as configurações.');
    return { topics: seeded.topics, specialCategories: seeded.special_categories };
  }

  async saveSettings(settings: BudgetSettings): Promise<void> {
    const userId = await this.requireUserId();
    await run(
      this.client.from('budget_settings').upsert(
        {
          user_id: userId,
          topics: settings.topics,
          special_categories: settings.specialCategories,
        },
        { onConflict: 'user_id' },
      ),
    );
  }

  async listMonths(): Promise<Month[]> {
    const data = await run(this.client.from('months').select('month').order('month'));
    return (data ?? []).map((row) => row.month);
  }

  async getMonth(month: Month): Promise<MonthData | undefined> {
    const data = await run(
      this.client.from('months').select('*').eq('month', month).maybeSingle(),
    );
    return data ? rowToMonthData(data) : undefined;
  }

  async ensureMonth(month: Month): Promise<MonthData> {
    const existing = await this.getMonth(month);
    if (existing) return existing;

    const userId = await this.requireUserId();
    const settings = await this.getSettings();
    const priorRows = await run(
      this.client
        .from('months')
        .select('*')
        .lt('month', month)
        .order('month', { ascending: false })
        .limit(1),
    );
    const previous = priorRows?.[0] ? rowToMonthData(priorRows[0]) : null;
    const previousSummary = previous ? computeMonthSummary(previous) : null;

    const created = createMonthData(month, settings.topics, previousSummary);
    const { error } = await this.client.from('months').insert(monthDataToInsert(created, userId));
    if (error && error.code !== UNIQUE_VIOLATION) throw new SupabaseStorageError(error);

    const stored = await this.getMonth(month);
    return stored ?? created;
  }

  async saveIncome(month: Month, income: Income): Promise<void> {
    const data = await this.requireOpenMonth(month);
    const idx = data.incomes.findIndex((i) => i.id === income.id);
    const incomes =
      idx >= 0 ? data.incomes.map((i, n) => (n === idx ? income : i)) : [...data.incomes, income];
    await this.patchMonth(month, { incomes });
    await this.recascade(month);
  }

  async deleteIncome(month: Month, incomeId: string): Promise<void> {
    const data = await this.requireOpenMonth(month);
    const incomes = data.incomes.filter((i) => i.id !== incomeId);
    await this.patchMonth(month, { incomes });
    await this.recascade(month);
  }

  async saveExpense(month: Month, expense: Expense): Promise<void> {
    const data = await this.requireOpenMonth(month);
    const idx = data.expenses.findIndex((e) => e.id === expense.id);
    const expenses =
      idx >= 0 ? data.expenses.map((e, n) => (n === idx ? expense : e)) : [...data.expenses, expense];
    await this.patchMonth(month, { expenses });
    await this.recascade(month);
  }

  async deleteExpense(month: Month, expenseId: string): Promise<void> {
    const data = await this.requireOpenMonth(month);
    const expenses = data.expenses.filter((e) => e.id !== expenseId);
    await this.patchMonth(month, { expenses });
    await this.recascade(month);
  }

  async closeMonth(month: Month): Promise<void> {
    await this.requireMonth(month);
    await this.patchMonth(month, { closed: true });
  }

  async reopenMonth(month: Month): Promise<void> {
    await this.requireMonth(month);
    await this.patchMonth(month, { closed: false });
    await this.recascade(month);
  }

  async exportData(): Promise<BackupPayload> {
    const settings = await this.getSettings();
    const data = await run(this.client.from('months').select('*').order('month'));
    const months = (data ?? []).map(rowToMonthData);
    return { version: 1, exportedAt: new Date().toISOString(), settings, months };
  }

  async importData(payload: BackupPayload): Promise<void> {
    const userId = await this.requireUserId();
    // Not a single transaction across PostgREST calls; acceptable for v1.
    await run(this.client.from('months').delete().eq('user_id', userId));

    await run(
      this.client.from('budget_settings').upsert(
        {
          user_id: userId,
          topics: payload.settings.topics,
          special_categories: payload.settings.specialCategories,
        },
        { onConflict: 'user_id' },
      ),
    );

    if (payload.months.length > 0) {
      const rows = payload.months.map((m) => monthDataToInsert(m, userId));
      await run(this.client.from('months').insert(rows));
    }
  }

  async clearAll(): Promise<void> {
    const userId = await this.requireUserId();
    await run(this.client.from('months').delete().eq('user_id', userId));
    await run(this.client.from('budget_settings').delete().eq('user_id', userId));
  }

  private async requireMonth(month: Month): Promise<MonthData> {
    const data = await this.getMonth(month);
    if (!data) throw new MonthNotFoundError(month);
    return data;
  }

  private async requireOpenMonth(month: Month): Promise<MonthData> {
    const data = await this.requireMonth(month);
    if (data.closed) throw new MonthClosedError(month);
    return data;
  }

  private async patchMonth(month: Month, patch: Partial<MonthRow>): Promise<void> {
    await run(this.client.from('months').update(patch).eq('month', month));
  }

  /** Recomputes carryIn for `fromMonth` onward in cascade and persists the changes. */
  private async recascade(fromMonth: Month): Promise<void> {
    const data = await run(
      this.client.from('months').select('*').gte('month', fromMonth).order('month'),
    );

    const chain = (data ?? []).map(rowToMonthData);
    if (chain.length === 0) return;

    const updated = cascadeCarryIn(chain, computeMonthSummary);
    const changed = updated.filter(
      (m, i) => JSON.stringify(m.carryIn) !== JSON.stringify(chain[i].carryIn),
    );

    await Promise.all(
      changed.map((m) =>
        run(this.client.from('months').update({ carry_in: m.carryIn }).eq('month', m.month)),
      ),
    );
  }
}
