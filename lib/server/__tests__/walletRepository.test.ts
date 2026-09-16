// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  computeMonthSummary,
  currentMonthKey,
  nextMonth,
  shiftMonth,
  todayISO,
  type InstallmentPlan,
} from '@/lib/budget';
import { PostgresBudgetRepository } from '../budgetRepository';
import * as schema from '../db/schema';
import type { Database } from '../db/types';
import { PostgresWalletRepository } from '../walletRepository';

let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

async function newAccount() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Teste', email: `${id}@teste.local` });
  const budget = new PostgresBudgetRepository(db, id);
  return { id, budget, wallet: new PostgresWalletRepository(db, id, budget) };
}

async function topicId(budget: PostgresBudgetRepository, name = 'Diversos'): Promise<string> {
  const settings = await budget.getSettings();
  return settings.topics.find((t) => t.name === name)!.id;
}

async function setPrice(ticker: string, price: number) {
  await db
    .insert(schema.priceCache)
    .values({ ticker, price, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: schema.priceCache.ticker, set: { price, fetchedAt: new Date() } });
}

/** A plan whose first charge is in `month`, so its charges are easy to place in tests. */
function planFor(month: string, overrides: Partial<InstallmentPlan> = {}): InstallmentPlan {
  return {
    id: randomUUID(),
    name: 'Notebook',
    categoryKind: 'fixedCost',
    firstDebitDate: `${month}-10`,
    count: 3,
    totalAmount: 300,
    accounting: 'installment',
    ...overrides,
  };
}

describe('PostgresWalletRepository', () => {
  it('keeps recurring templates per account, in the order they were created', async () => {
    const alice = await newAccount();
    const bob = await newAccount();
    await alice.wallet.saveRecurring({
      id: 'r1',
      categoryKind: 'fixedCost',
      description: 'Aluguel',
      amount: 1500,
      card: false,
    });
    await alice.wallet.saveRecurring({
      id: 'r2',
      categoryKind: 'fixedCost',
      description: 'Internet',
      amount: 120,
      card: true,
    });

    const snapshot = await alice.wallet.getSnapshot();
    expect(snapshot.recurring.map((r) => r.description)).toEqual(['Aluguel', 'Internet']);
    expect(snapshot.recurring[1].card).toBe(true);
    expect((await bob.wallet.getSnapshot()).recurring).toEqual([]);

    await alice.wallet.saveRecurring({
      id: 'r1',
      categoryKind: 'topic',
      topicId: await topicId(alice.budget),
      description: 'Aluguel novo',
      amount: 1600,
      card: false,
    });
    const edited = await alice.wallet.getSnapshot();
    expect(edited.recurring.map((r) => r.description)).toEqual(['Aluguel novo', 'Internet']);

    await alice.wallet.deleteRecurring('r1');
    expect((await alice.wallet.getSnapshot()).recurring).toHaveLength(1);
  });

  it('charges the instalment of a plan into the months that already exist and are open', async () => {
    const { budget, wallet } = await newAccount();
    const month = currentMonthKey();
    await budget.ensureMonth(month);
    await budget.ensureMonth(nextMonth(month));

    const plan = planFor(month);
    await wallet.saveInstallment(plan);

    const first = await budget.getMonth(month);
    const second = await budget.getMonth(nextMonth(month));
    expect(first?.expenses.map((e) => e.description)).toEqual(['Notebook 1/3']);
    expect(first?.expenses[0]).toMatchObject({
      amount: 100,
      singleInstallmentCard: true,
      source: 'installment',
      installmentId: plan.id,
      installmentNumber: 1,
    });
    expect(second?.expenses.map((e) => e.description)).toEqual(['Notebook 2/3']);
  });

  it('shows the coming instalment in a month that does not exist yet, and keeps it when it does', async () => {
    const { budget, wallet } = await newAccount();
    const month = currentMonthKey();
    const third = shiftMonth(month, 2);
    await wallet.saveInstallment(planFor(month));

    const preview = await budget.peekMonth(third);
    expect(preview.expenses.map((e) => e.description)).toEqual(['Notebook 3/3']);
    expect(await budget.listMonths()).not.toContain(third);

    const created = await budget.ensureMonth(third);
    expect(created.expenses.map((e) => e.description)).toEqual(['Notebook 3/3']);
    expect((await budget.getMonth(third))?.expenses).toHaveLength(1);
  });

  it('never charges a closed month, and never charges the same instalment twice', async () => {
    const { budget, wallet } = await newAccount();
    const month = currentMonthKey();
    await budget.ensureMonth(month);
    await budget.closeMonth(month);

    const plan = planFor(month);
    await wallet.saveInstallment(plan);
    expect((await budget.getMonth(month))?.expenses).toEqual([]);

    // Saving the plan again (an edit) must not duplicate the charges of the open months.
    const later = nextMonth(month);
    await budget.ensureMonth(later);
    await wallet.saveInstallment(plan);
    await wallet.saveInstallment(plan);
    expect((await budget.getMonth(later))?.expenses).toHaveLength(1);
  });

  it('launches an "À vista" plan as a single card expense, and charges no instalment', async () => {
    const { budget, wallet } = await newAccount();
    const month = currentMonthKey();
    const plan = planFor(month, { accounting: 'upfront', name: 'Faculdade', totalAmount: 872.36 });

    await wallet.saveInstallment(plan, { month, date: `${month}-05` });

    const data = await budget.getMonth(month);
    expect(data?.expenses).toHaveLength(1);
    expect(data?.expenses[0]).toMatchObject({
      description: 'Faculdade',
      amount: 872.36,
      singleInstallmentCard: true,
    });
    expect(data?.expenses[0].installmentId).toBeUndefined();
  });

  it('deleting a plan drops the charges still ahead and keeps the ones already made', async () => {
    const { budget, wallet } = await newAccount();
    const month = currentMonthKey();
    const previous = shiftMonth(month, -1);
    await budget.ensureMonth(previous);
    await budget.ensureMonth(month);
    await budget.ensureMonth(nextMonth(month));

    // First charge last month (already paid), then this month and the next.
    const plan = planFor(previous, { firstDebitDate: `${previous}-10` });
    await wallet.saveInstallment(plan);
    expect((await budget.getMonth(nextMonth(month)))?.expenses).toHaveLength(1);

    await wallet.deleteInstallment(plan.id);

    expect((await wallet.getSnapshot()).installments).toEqual([]);
    expect((await budget.getMonth(previous))?.expenses).toHaveLength(1);
    expect((await budget.getMonth(nextMonth(month)))?.expenses).toEqual([]);
  });

  it('allocates money to a bucket: quotas in, expense in the bucket topic', async () => {
    const { budget, wallet } = await newAccount();
    const metas = await topicId(budget, 'Metas');
    const month = currentMonthKey();
    await setPrice('AUPO11', 100);
    await wallet.tradeQuotas(50);
    await wallet.saveBucket({ id: 'b1', name: 'Metas', topicId: metas, quotas: 0 });

    await wallet.allocate({ bucketId: 'b1', amount: 250, month, date: todayISO() });

    const snapshot = await wallet.getSnapshot();
    expect(snapshot.investments.buckets[0].quotas).toBeCloseTo(2.5, 8);
    expect(snapshot.investments.freeQuotas).toBeCloseTo(47.5, 8);
    expect(snapshot.investments.freeValue).toBe(4750);

    const data = await budget.getMonth(month);
    expect(data?.expenses[0]).toMatchObject({
      description: 'AUPO11',
      amount: 250,
      topicId: metas,
      source: 'investment',
      singleInstallmentCard: false,
    });
    expect(computeMonthSummary(data!).topics.find((t) => t.topicId === metas)?.spent).toBe(250);
  });

  it('refuses to allocate without a quote or to sell quotas that do not exist', async () => {
    const { budget, wallet } = await newAccount();
    await wallet.setTicker('XPTO11');
    await wallet.saveBucket({ id: 'b1', name: 'Metas', topicId: await topicId(budget), quotas: 0 });

    await expect(
      wallet.allocate({ bucketId: 'b1', amount: 10, month: currentMonthKey(), date: todayISO() }),
    ).rejects.toThrow(/cotação/i);
    await expect(wallet.tradeQuotas(-1)).rejects.toThrow(/cotas/i);
  });

  it('reports the cash: reserve, card of the open month and what the plans still owe', async () => {
    const { budget, wallet } = await newAccount();
    const month = currentMonthKey();
    await setPrice('AUPO11', 10);
    await wallet.tradeQuotas(100);
    await wallet.saveCashSettings({
      reserveAccountAmount: 1000,
      emergencyCosts: [
        { label: 'Contas', amount: 900 },
        { label: 'Faculdade', amount: 500 },
      ],
      reserveMultiplier: 6,
    });
    await budget.saveExpense(month, {
      id: 'e1',
      categoryKind: 'fixedCost',
      description: 'Mercado no cartão',
      amount: 200,
      date: `${month}-02`,
      singleInstallmentCard: true,
    });
    // A plan whose charges are all in the future: nothing of it was launched yet.
    const future = shiftMonth(month, 6);
    await wallet.saveInstallment(planFor(future, { count: 2, totalAmount: 200 }));

    const { cash } = await wallet.getSnapshot();
    expect(cash.report.cardMonth).toBe(month);
    expect(cash.report.cardDebt).toBe(-200);
    expect(cash.report.installmentDebt).toBe(-200);
    expect(cash.report.totalReserve).toBe(2000);
    expect(cash.report.totalDebt).toBe(-400);
    expect(cash.report.expectedReserve).toBe(8400);
    expect(cash.report.gap).toBe(2000 - 400 - 8400);
  });

  it('stops counting an instalment as debt once it becomes an expense of the month', async () => {
    const { budget, wallet } = await newAccount();
    const month = currentMonthKey();
    // First charge later this month, so it is both ahead of today and inside the open month.
    const plan = planFor(month, { firstDebitDate: addMonthsClamped(todayISO(), 0), count: 2, totalAmount: 200 });
    const dueLater = addMonthsClamped(todayISO(), 1);
    await wallet.saveInstallment(plan);

    // Nothing exists yet: both charges are owed (the one today is not "after today").
    const before = await wallet.getSnapshot();
    expect(before.cash.report.installmentDebt).toBe(-100);

    // Creating the month turns the charges of that competence into expenses.
    await budget.ensureMonth(dueLater.slice(0, 7));
    const after = await wallet.getSnapshot();
    expect(after.cash.report.installmentDebt).toBe(0);
  });
});
