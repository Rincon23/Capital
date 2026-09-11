import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeMonthSummary } from '@/lib/budget';
import type { Database } from '@/lib/supabase/database.types';
import { MonthClosedError, MonthNotFoundError, NotAuthenticatedError } from '../repository';
import { SupabaseBudgetRepository } from '../supabaseRepository';

/**
 * In-memory stand-in for the Supabase client covering just the query surface the
 * repository uses. It does NOT simulate RLS (tests act as a single user); it
 * does enforce primary keys so the seed/ensure race paths are exercised.
 */
type Row = Record<string, unknown>;
const USER_ID = 'user-1';
const PK: Record<string, string[]> = {
  budget_settings: ['user_id'],
  months: ['user_id', 'month'],
};

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | Row[] | undefined;
  private predicates: Array<(r: Row) => boolean> = [];
  private orderBy: { col: string; asc: boolean } | undefined;
  private limitN: number | undefined;
  private shape: 'many' | 'maybe' | 'one' = 'many';

  constructor(private readonly store: Record<string, Row[]>, private readonly table: string) {}

  select() {
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[]) {
    this.op = 'upsert';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, value: unknown) {
    this.predicates.push((r) => r[col] === value);
    return this;
  }
  lt(col: string, value: string) {
    this.predicates.push((r) => String(r[col]) < value);
    return this;
  }
  gte(col: string, value: string) {
    this.predicates.push((r) => String(r[col]) >= value);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.shape = 'maybe';
    return this;
  }
  single() {
    this.shape = 'one';
    return this;
  }

  then<TResult1 = { data: unknown; error: unknown }>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
  ): PromiseLike<TResult1> {
    return Promise.resolve(this.run()).then(onfulfilled ?? undefined);
  }

  private rows(): Row[] {
    return (this.store[this.table] ??= []);
  }

  private matches(r: Row): boolean {
    return this.predicates.every((p) => p(r));
  }

  private keyOf(r: Row): string {
    return PK[this.table].map((c) => String(r[c])).join('|');
  }

  private withDefaults(r: Row): Row {
    const filled: Row = { user_id: USER_ID, updated_at: new Date().toISOString(), ...r };
    if (this.table === 'months' && filled.closed === undefined) filled.closed = false;
    return filled;
  }

  private run(): { data: unknown; error: unknown } {
    const rows = this.rows();

    if (this.op === 'insert' || this.op === 'upsert') {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) =>
        this.withDefaults(r),
      );
      for (const r of incoming) {
        const idx = rows.findIndex((existing) => this.keyOf(existing) === this.keyOf(r));
        if (idx >= 0) {
          if (this.op === 'insert') return { data: null, error: { code: '23505' } };
          rows[idx] = { ...rows[idx], ...r };
        } else {
          rows.push(r);
        }
      }
      return { data: null, error: null };
    }

    if (this.op === 'update') {
      for (let i = 0; i < rows.length; i++) {
        if (this.matches(rows[i])) rows[i] = { ...rows[i], ...(this.payload as Row) };
      }
      return { data: null, error: null };
    }

    if (this.op === 'delete') {
      this.store[this.table] = rows.filter((r) => !this.matches(r));
      return { data: null, error: null };
    }

    let result = rows.filter((r) => this.matches(r));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      result = [...result].sort((a, b) =>
        String(a[col]) < String(b[col]) ? (asc ? -1 : 1) : asc ? 1 : -1,
      );
    }
    if (this.limitN !== undefined) result = result.slice(0, this.limitN);

    if (this.shape === 'many') return { data: result, error: null };
    return { data: result[0] ?? null, error: null };
  }
}

function makeClient(claims: { sub: string } | null = { sub: USER_ID }) {
  const store: Record<string, Row[]> = {};
  const client = {
    auth: {
      getClaims: async () => ({ data: claims ? { claims } : null, error: null }),
    },
    from: (table: string) => new FakeQuery(store, table),
  };
  return { client: client as unknown as SupabaseClient<Database>, store };
}

function repo(client: SupabaseClient<Database>) {
  return new SupabaseBudgetRepository(() => client);
}

describe('SupabaseBudgetRepository', () => {
  let client: SupabaseClient<Database>;
  let store: Record<string, Row[]>;
  let subject: SupabaseBudgetRepository;

  beforeEach(() => {
    ({ client, store } = makeClient());
    subject = repo(client);
  });

  it('seeds the default envelopes once, with no demo month', async () => {
    const first = await subject.getSettings();
    expect(first.topics.map((t) => t.name)).toEqual([
      'Diversos',
      'Investimentos',
      'Metas',
      'Conhecimentos',
    ]);

    const second = await subject.getSettings();
    expect(second.topics).toEqual(first.topics);
    expect(store.budget_settings).toHaveLength(1);
    expect(store.months ?? []).toHaveLength(0);
  });

  it('creates the first month with zeroed carryIn', async () => {
    const month = await subject.ensureMonth('2026-01');
    expect(month.incomes).toEqual([]);
    expect(Object.values(month.carryIn).every((v) => v === 0)).toBe(true);
  });

  it('rolls the previous month remaining into the next month carryIn', async () => {
    const settings = await subject.getSettings();
    const diversos = settings.topics.find((t) => t.name === 'Diversos')!;

    await subject.ensureMonth('2026-01');
    await subject.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });

    const february = await subject.ensureMonth('2026-02');
    // available(Diversos) = 1000 * 0.20 - 0 + 0 = 200; nothing spent -> remaining 200
    expect(february.carryIn[diversos.id]).toBe(200);
  });

  it('re-cascades later months when an earlier month changes', async () => {
    const settings = await subject.getSettings();
    const diversos = settings.topics.find((t) => t.name === 'Diversos')!;

    await subject.ensureMonth('2026-01');
    await subject.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });
    await subject.ensureMonth('2026-02');
    expect((await subject.getMonth('2026-02'))?.carryIn[diversos.id]).toBe(200);

    await subject.saveIncome('2026-01', { id: 'i2', source: 'Bônus', amount: 1000 });
    // income now 2000 -> available(Diversos) = 400
    expect((await subject.getMonth('2026-02'))?.carryIn[diversos.id]).toBe(400);
  });

  it('deletes a month and re-anchors the carryIn of the remaining months', async () => {
    const settings = await subject.getSettings();
    const diversos = settings.topics.find((t) => t.name === 'Diversos')!;

    await subject.ensureMonth('2026-01');
    await subject.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });
    await subject.ensureMonth('2026-02');
    expect((await subject.getMonth('2026-02'))?.carryIn[diversos.id]).toBe(200);

    await subject.deleteMonth('2026-01');
    expect(await subject.listMonths()).toEqual(['2026-02']);
    // 2026-02 is now the earliest month -> carryIn falls back to zero
    expect((await subject.getMonth('2026-02'))?.carryIn[diversos.id]).toBe(0);
  });

  it('rejects writes to a closed month and unknown months', async () => {
    await subject.ensureMonth('2026-01');
    await subject.closeMonth('2026-01');

    await expect(
      subject.saveExpense('2026-01', {
        id: 'e1',
        categoryKind: 'fixedCost',
        description: 'x',
        amount: 10,
        date: '2026-01-02',
      }),
    ).rejects.toBeInstanceOf(MonthClosedError);

    await expect(subject.reopenMonth('2099-12')).rejects.toBeInstanceOf(MonthNotFoundError);
  });

  it('does not persist a month just from peeking, but a write (or close) creates it', async () => {
    await subject.peekMonth('2030-05');
    expect(await subject.listMonths()).not.toContain('2030-05');

    await subject.saveExpense('2030-05', {
      id: 'e1',
      categoryKind: 'fixedCost',
      description: 'x',
      amount: 10,
      date: '2030-05-02',
    });
    expect(await subject.listMonths()).toContain('2030-05');

    await subject.peekMonth('2030-06');
    expect(await subject.listMonths()).not.toContain('2030-06');
    await subject.closeMonth('2030-06');
    expect(await subject.listMonths()).toContain('2030-06');
  });

  it('round-trips through export and import', async () => {
    await subject.ensureMonth('2026-01');
    await subject.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1500 });

    const backup = await subject.exportData();
    expect(backup.version).toBe(1);
    expect(backup.months).toHaveLength(1);

    const { client: fresh } = makeClient();
    const target = repo(fresh);
    await target.importData(backup);

    const restored = await target.getMonth('2026-01');
    expect(restored?.incomes).toEqual([{ id: 'i1', source: 'Salário', amount: 1500 }]);
    expect(computeMonthSummary(restored!).incomeTotal).toBe(1500);
  });

  it('throws NotAuthenticatedError without a session', async () => {
    const { client: anon } = makeClient(null);
    await expect(repo(anon).saveSettings({ topics: [], specialCategories: {} as never })).rejects.toBeInstanceOf(
      NotAuthenticatedError,
    );
  });
});
