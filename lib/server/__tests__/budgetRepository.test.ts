// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeMonthSummary, currentMonthKey, previousMonth, type Expense } from '@/lib/budget';
import { NO_MODULES, resolveHomePages, resolveModules } from '@/lib/modules';
import { BACKUP_VERSION, MonthClosedError, MonthNotFoundError } from '@/lib/storage/repository';
import { PostgresBudgetRepository } from '../budgetRepository';
import * as schema from '../db/schema';
import type { Database } from '../db/types';

/**
 * The real schema and migrations on PGlite (Postgres compiled to WASM, in-process). Every
 * test gets its own account, which also exercises the per-user scoping.
 */
let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

async function newAccount() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Teste', email: `${id}@teste.local` });
  return { id, repo: new PostgresBudgetRepository(db, id) };
}

function fixedCost(overrides: Partial<Expense> = {}): Expense {
  return {
    id: randomUUID(),
    categoryKind: 'fixedCost',
    description: 'x',
    amount: 10,
    date: '2026-01-02',
    ...overrides,
  };
}

async function diversosId(repo: PostgresBudgetRepository): Promise<string> {
  const settings = await repo.getSettings();
  return settings.topics.find((t) => t.name === 'Diversos')!.id;
}

describe('PostgresBudgetRepository', () => {
  it('seeds the default envelopes once, with no demo month', async () => {
    const { repo } = await newAccount();
    const first = await repo.getSettings();
    expect(first.topics.map((t) => t.name)).toEqual(['Diversos', 'Investimentos', 'Metas', 'Conhecimentos']);

    const second = await repo.getSettings();
    expect(second.topics).toEqual(first.topics);
    expect(await repo.listMonths()).toEqual([]);
  });

  it('marks a brand-new account as not yet onboarded, and stays that way across reads', async () => {
    const { repo } = await newAccount();
    expect((await repo.getSettings()).onboardingCompleted).toBe(false);
    expect((await repo.getSettings()).onboardingCompleted).toBe(false);
  });

  it('completeOnboarding persists across repository instances (new device/browser)', async () => {
    const { id, repo } = await newAccount();
    await repo.getSettings();
    await repo.completeOnboarding();

    expect((await repo.getSettings()).onboardingCompleted).toBe(true);
    const otherDevice = new PostgresBudgetRepository(db, id);
    expect((await otherDevice.getSettings()).onboardingCompleted).toBe(true);
  });

  it('saving settings never touches the onboarding flag', async () => {
    const { repo } = await newAccount();
    const settings = await repo.getSettings();
    await repo.completeOnboarding();
    await repo.saveSettings({ ...settings, onboardingCompleted: false });
    expect((await repo.getSettings()).onboardingCompleted).toBe(true);
  });

  it('creates the first month with zeroed carryIn', async () => {
    const { repo } = await newAccount();
    const month = await repo.ensureMonth('2026-01');
    expect(month.incomes).toEqual([]);
    expect(Object.values(month.carryIn).every((v) => v === 0)).toBe(true);
  });

  it('rolls the previous month remaining into the next month carryIn', async () => {
    const { repo } = await newAccount();
    const diversos = await diversosId(repo);

    await repo.ensureMonth('2026-01');
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });

    const february = await repo.ensureMonth('2026-02');
    // available(Diversos) = 1000 * 0.20 - 0 + 0 = 200; nothing spent -> remaining 200
    expect(february.carryIn[diversos]).toBe(200);
  });

  it('re-cascades later months when an earlier month changes', async () => {
    const { repo } = await newAccount();
    const diversos = await diversosId(repo);

    await repo.ensureMonth('2026-01');
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });
    await repo.ensureMonth('2026-02');
    expect((await repo.getMonth('2026-02'))?.carryIn[diversos]).toBe(200);

    await repo.saveIncome('2026-01', { id: 'i2', source: 'Bônus', amount: 1000 });
    expect((await repo.getMonth('2026-02'))?.carryIn[diversos]).toBe(400);
  });

  it('keeps an income sent to one category and carries it into that category only', async () => {
    const { repo } = await newAccount();
    const diversos = await diversosId(repo);

    await repo.ensureMonth('2026-01');
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Presente', amount: 500, topicId: diversos });
    expect((await repo.getMonth('2026-01'))?.incomes).toEqual([
      { id: 'i1', source: 'Presente', amount: 500, topicId: diversos },
    ]);

    const february = await repo.ensureMonth('2026-02');
    expect(february.carryIn[diversos]).toBe(500);
    expect(Object.values(february.carryIn).reduce((a, b) => a + b, 0)).toBe(500);
  });

  it("keeps an existing category's carryIn when Settings only reorders categories", async () => {
    const { repo } = await newAccount();
    const settings = await repo.getSettings();
    const diversos = settings.topics.find((t) => t.name === 'Diversos')!;
    const investimentos = settings.topics.find((t) => t.name === 'Investimentos')!;

    await repo.ensureMonth('2026-01');
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });
    await repo.ensureMonth('2026-02');

    const reordered = settings.topics.map((t) => {
      if (t.id === diversos.id) return { ...t, order: investimentos.order };
      if (t.id === investimentos.id) return { ...t, order: diversos.order };
      return t;
    });
    await repo.saveSettings({ ...settings, topics: reordered });

    const february = (await repo.getMonth('2026-02'))!;
    expect(february.carryIn[diversos.id]).toBe(200);
    const summary = computeMonthSummary(february, reordered);
    expect(summary.topics.find((t) => t.topicId === diversos.id)?.available).toBe(200);
    expect(summary.topics[0].topicId).toBe(diversos.id);
  });

  it("keeps existing categories' carryIn when a new category is added alongside a reorder", async () => {
    const thisMonth = currentMonthKey();
    const lastMonth = previousMonth(thisMonth);
    const { repo } = await newAccount();
    const settings = await repo.getSettings();
    const diversos = settings.topics.find((t) => t.name === 'Diversos')!;
    const investimentos = settings.topics.find((t) => t.name === 'Investimentos')!;

    await repo.ensureMonth(lastMonth);
    await repo.saveIncome(lastMonth, { id: 'i1', source: 'Salário', amount: 1000 });
    await repo.ensureMonth(thisMonth);

    const withNewAndReordered = [
      ...settings.topics.map((t) => {
        if (t.id === diversos.id) return { ...t, order: investimentos.order };
        if (t.id === investimentos.id) return { ...t, order: diversos.order };
        return t;
      }),
      { id: 'nova', name: 'Nova categoria', targetPct: 0, order: settings.topics.length },
    ];
    await repo.saveSettings({ ...settings, topics: withNewAndReordered });

    const summary = computeMonthSummary((await repo.getMonth(thisMonth))!, withNewAndReordered);
    expect(summary.topics.find((t) => t.topicId === diversos.id)?.carryIn).toBe(200);
    expect(summary.topics.find((t) => t.topicId === 'nova')?.carryIn).toBe(0);
  });

  it('deletes the earliest month and re-anchors the next one to zero carryIn', async () => {
    const { repo } = await newAccount();
    const diversos = await diversosId(repo);

    await repo.ensureMonth('2026-01');
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });
    await repo.ensureMonth('2026-02');
    expect((await repo.getMonth('2026-02'))?.carryIn[diversos]).toBe(200);

    await repo.deleteMonth('2026-01');
    expect(await repo.listMonths()).toEqual(['2026-02']);
    expect((await repo.getMonth('2026-02'))?.carryIn[diversos]).toBe(0);
  });

  it('deletes a middle month: the next month rolls over from the one before, the first keeps its anchor', async () => {
    const { repo } = await newAccount();
    const settings = await repo.getSettings();
    const diversos = settings.topics.find((t) => t.name === 'Diversos')!.id;
    const topicsSnapshot = settings.topics;
    const zero = Object.fromEntries(topicsSnapshot.map((t) => [t.id, 0]));
    // January starts with a balance carried in from outside the app (e.g. the old spreadsheet).
    await repo.importData({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      months: [
        {
          month: '2026-01',
          incomes: [{ id: 'i1', source: 'Salário', amount: 1000 }],
          expenses: [],
          carryIn: { ...zero, [diversos]: 50 },
          topicsSnapshot,
        },
      ],
    });
    await repo.ensureMonth('2026-02');
    await repo.saveIncome('2026-02', { id: 'i2', source: 'Salário', amount: 500 });
    await repo.ensureMonth('2026-03');
    // Jan: 200 + 50 = 250; Feb: 100 + 250 = 350 -> March carries 350.
    expect((await repo.getMonth('2026-03'))?.carryIn[diversos]).toBe(350);

    await repo.deleteMonth('2026-02');
    expect(await repo.listMonths()).toEqual(['2026-01', '2026-03']);
    expect((await repo.getMonth('2026-01'))?.carryIn[diversos]).toBe(50);
    expect((await repo.getMonth('2026-03'))?.carryIn[diversos]).toBe(250);
  });

  it('rejects writes to a closed month and unknown months', async () => {
    const { repo } = await newAccount();
    await repo.ensureMonth('2026-01');
    await repo.closeMonth('2026-01');

    await expect(repo.saveExpense('2026-01', fixedCost())).rejects.toBeInstanceOf(MonthClosedError);
    await expect(repo.deleteExpense('2099-12', 'x')).rejects.toBeInstanceOf(MonthNotFoundError);
    await expect(repo.reopenMonth('2099-12')).rejects.toBeInstanceOf(MonthNotFoundError);
  });

  it('reopening a month allows writes again and re-cascades the months after it', async () => {
    const { repo } = await newAccount();
    const diversos = await diversosId(repo);
    await repo.ensureMonth('2026-01');
    await repo.ensureMonth('2026-02');
    await repo.closeMonth('2026-01');
    expect((await repo.getMonth('2026-01'))?.closed).toBe(true);

    await repo.reopenMonth('2026-01');
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });
    expect((await repo.getMonth('2026-01'))?.closed).toBe(false);
    expect((await repo.getMonth('2026-02'))?.carryIn[diversos]).toBe(200);
  });

  it('does not persist a month just from peeking, but a write (or close) creates it', async () => {
    const { repo } = await newAccount();
    await repo.peekMonth('2030-05');
    expect(await repo.listMonths()).not.toContain('2030-05');

    await repo.saveExpense('2030-05', fixedCost({ date: '2030-05-02' }));
    expect(await repo.listMonths()).toContain('2030-05');

    await repo.peekMonth('2030-06');
    expect(await repo.listMonths()).not.toContain('2030-06');
    await repo.closeMonth('2030-06');
    expect(await repo.listMonths()).toContain('2030-06');
  });

  it('keeps entries in order with exact amounts and dates; editing does not move an entry', async () => {
    const { repo } = await newAccount();
    const diversos = await diversosId(repo);
    const first = fixedCost({ id: 'a', amount: 144.8, date: '2026-01-31' });
    const second: Expense = {
      id: 'b',
      categoryKind: 'topic',
      topicId: diversos,
      description: 'Mercado',
      amount: 0.1,
      date: '2026-01-05',
      singleInstallmentCard: true,
    };
    const third = fixedCost({ id: 'c', amount: 1234.567 });
    await repo.saveExpense('2026-01', first);
    await repo.saveExpense('2026-01', second);
    await repo.saveExpense('2026-01', third);
    await repo.saveExpense('2026-01', { ...first, description: 'editado', amount: 99.99 });
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 5000.5, date: '2026-01-05' });

    const month = (await repo.getMonth('2026-01'))!;
    expect(month.expenses.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(month.expenses[0]).toMatchObject({ description: 'editado', amount: 99.99, date: '2026-01-31' });
    expect(month.expenses[1]).toEqual(second);
    expect(month.expenses[2].amount).toBe(1234.567);
    expect(month.incomes).toEqual([{ id: 'i1', source: 'Salário', amount: 5000.5, date: '2026-01-05' }]);
  });

  it('round-trips through export and import into another account', async () => {
    const { repo } = await newAccount();
    await repo.ensureMonth('2026-01');
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1500 });
    await repo.saveExpense('2026-01', fixedCost({ id: 'e1' }));
    await repo.closeMonth('2026-01');

    const backup = await repo.exportData();
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.months).toHaveLength(1);

    const { repo: target } = await newAccount();
    await target.importData(backup);
    const restored = (await target.getMonth('2026-01'))!;
    expect(restored.incomes).toEqual([{ id: 'i1', source: 'Salário', amount: 1500 }]);
    expect(restored.expenses.map((e) => e.id)).toEqual(['e1']);
    expect(restored.closed).toBe(true);
    expect(computeMonthSummary(restored)).toEqual(computeMonthSummary(backup.months[0]));
    expect((await target.getSettings()).topics).toEqual(backup.settings.topics);
  });

  it('keeps accounts apart: one never sees or changes the data of another', async () => {
    const alice = await newAccount();
    const bob = await newAccount();
    await alice.repo.saveExpense('2026-01', fixedCost({ id: 'same-id' }));
    await bob.repo.saveExpense('2026-01', fixedCost({ id: 'same-id', amount: 99 }));

    await bob.repo.deleteExpense('2026-01', 'same-id');
    await bob.repo.deleteMonth('2026-01');
    await bob.repo.clearAll();

    const aliceMonth = await alice.repo.getMonth('2026-01');
    expect(aliceMonth?.expenses).toHaveLength(1);
    expect(aliceMonth?.expenses[0].amount).toBe(10);
    expect(await bob.repo.listMonths()).toEqual([]);
  });

  it('never deletes a category: one left out of a save comes back archived, and descriptions persist', async () => {
    const { repo } = await newAccount();
    const settings = await repo.getSettings();
    expect(settings.topics.map((t) => t.preset)).toEqual([
      'diversos',
      'investimentos',
      'metas',
      'conhecimentos',
    ]);
    expect(settings.topics.every((t) => (t.description ?? '').length > 0)).toBe(true);

    const [diversos, ...rest] = settings.topics;
    await repo.saveSettings({
      ...settings,
      topics: [...rest.map((t) => (t.preset === 'metas' ? { ...t, description: 'Viagem' } : t))],
    });

    const saved = (await repo.getSettings()).topics;
    expect(saved).toHaveLength(4);
    expect(saved.find((t) => t.id === diversos.id)).toMatchObject({ archived: true, name: 'Diversos' });
    expect(saved.find((t) => t.preset === 'metas')?.description).toBe('Viagem');
  });

  it('stores the modules a user turned on, and starts everyone with none', async () => {
    const { id, repo } = await newAccount();
    const settings = await repo.getSettings();
    expect(resolveModules(settings)).toEqual(NO_MODULES);

    await repo.saveSettings({ ...settings, modules: { expenses: true, card: true, reimbursable: true } });
    expect(resolveModules(await repo.getSettings())).toEqual({
      ...NO_MODULES,
      expenses: true,
      card: true,
      reimbursable: true,
    });

    // Another account is untouched: modules are per user, like every other setting.
    const other = await newAccount();
    expect(resolveModules(await other.repo.getSettings())).toEqual(NO_MODULES);

    const sameUserElsewhere = new PostgresBudgetRepository(db, id);
    expect(resolveModules(await sameUserElsewhere.getSettings()).reimbursable).toBe(true);

    // A client that does not know about modules (an old cached bundle) must not switch them off.
    const withoutModules = { ...(await repo.getSettings()) };
    delete withoutModules.modules;
    await repo.saveSettings(withoutModules);
    expect(resolveModules(await repo.getSettings()).reimbursable).toBe(true);
  });

  it('stores the Início pages and the dismissed notices per account, in every device', async () => {
    const { id, repo } = await newAccount();
    const settings = await repo.getSettings();
    expect(settings.homePages).toBeNull();
    expect(settings.dismissedNotices).toEqual([]);

    await repo.saveSettings({
      ...settings,
      modules: { reminders: true, gmail: true },
      homePages: [['gmail'], ['reminders', 'calendar']],
      homeOrder: null,
      dismissedNotices: ['modular-intro'],
    });

    const elsewhere = await new PostgresBudgetRepository(db, id).getSettings();
    expect(resolveHomePages(elsewhere)).toEqual([['gmail'], ['reminders', 'calendar']]);
    expect(elsewhere.dismissedNotices).toEqual(['modular-intro']);

    // Saving without them (an older client) keeps them.
    const withoutPages = { ...elsewhere };
    delete withoutPages.homePages;
    delete withoutPages.dismissedNotices;
    await repo.saveSettings(withoutPages);
    expect((await repo.getSettings()).homePages).toEqual([['gmail'], ['reminders', 'calendar']]);
    expect((await repo.getSettings()).dismissedNotices).toEqual(['modular-intro']);

    // Nobody else's app changes.
    const other = await newAccount();
    const otherSettings = await other.repo.getSettings();
    expect(otherSettings.homePages).toBeNull();
    expect(resolveHomePages(otherSettings)).toEqual([[]]);

    // The backup carries them to another account.
    const { repo: target } = await newAccount();
    await target.importData(await repo.exportData());
    const restored = await target.getSettings();
    expect(restored.homePages).toEqual([['gmail'], ['reminders', 'calendar']]);
    expect(restored.dismissedNotices).toEqual(['modular-intro']);
    expect(resolveModules(restored).gmail).toBe(true);
  });

  it('restores an older backup with a bottom bar and a single Início list', async () => {
    const { repo } = await newAccount();
    const backup = await repo.exportData();
    const { repo: target } = await newAccount();
    await target.importData({
      ...backup,
      settings: {
        ...backup.settings,
        modules: { expenses: true, reminders: true },
        nav: ['reminders', 'inicio'],
        homeOrder: ['reminders', 'expenses'],
        homePages: undefined,
      },
    });
    const restored = await target.getSettings();
    // The bar is kept as it came, but nothing reads it; the old list becomes the first page.
    expect(restored.nav).toEqual(['reminders', 'inicio']);
    expect(resolveHomePages(restored)).toEqual([['reminders', 'calendar', 'expenses']]);
  });

  it('carries an unpaid "A receber" into the next months until someone pays it back', async () => {
    const { repo } = await newAccount();
    const owed = (id: string, date: string): Expense => ({
      id,
      categoryKind: 'reimbursable',
      description: id,
      amount: 50,
      date,
    });
    await repo.saveExpense('2026-01', owed('jan', '2026-01-10'));
    await repo.saveExpense('2026-02', owed('fev', '2026-02-03'));
    await repo.saveExpense('2026-03', owed('mar', '2026-03-01'));
    await repo.saveExpense('2026-02', fixedCost({ date: '2026-02-01' }));
    await repo.closeMonth('2026-01');

    // February sees January's still owed, but nothing from March yet.
    const pending = await repo.pendingReimbursables('2026-02');
    expect(pending.map((p) => [p.month, p.expense.id])).toEqual([
      ['2026-02', 'fev'],
      ['2026-01', 'jan'],
    ]);

    // "Já me pagou" works in a closed month too: it changes no number of the budget.
    await repo.setReimbursed('2026-01', 'jan', '2026-02-15T12:00:00.000Z');
    expect((await repo.pendingReimbursables('2026-02')).map((p) => p.expense.id)).toEqual(['fev']);
    const january = (await repo.getMonth('2026-01'))!;
    expect(january.expenses[0].reimbursedAt).toBe('2026-02-15T12:00:00.000Z');

    await repo.setReimbursed('2026-01', 'jan', null);
    expect((await repo.pendingReimbursables('2026-03')).map((p) => p.expense.id)).toEqual([
      'mar',
      'fev',
      'jan',
    ]);

    // Only an "A receber" can be marked: anything else is not found.
    const other = (await repo.getMonth('2026-02'))!.expenses.find((e) => e.categoryKind === 'fixedCost')!;
    await expect(repo.setReimbursed('2026-02', other.id, null)).rejects.toThrow();
  });

  it('keeps an "A receber" expense on the card bill and out of every envelope', async () => {
    const { repo } = await newAccount();
    const diversos = await diversosId(repo);
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });
    await repo.saveExpense('2026-01', {
      id: 'r1',
      categoryKind: 'reimbursable',
      description: 'Compra para outra pessoa',
      amount: 73,
      date: '2026-01-05',
      singleInstallmentCard: true,
    });

    const month = (await repo.getMonth('2026-01'))!;
    const stored = month.expenses[0];
    expect(stored.categoryKind).toBe('reimbursable');
    expect(stored.topicId).toBeUndefined();

    const summary = computeMonthSummary(month);
    expect(summary.reimbursableTotal).toBe(73);
    expect(summary.cardTotal).toBe(73);
    expect(summary.expenseTotal).toBe(0);
    expect(summary.topics.find((t) => t.topicId === diversos)?.spent).toBe(0);
  });

  it('closes a month and opens the next one carrying the leftovers, in one go', async () => {
    const { repo } = await newAccount();
    const diversos = await diversosId(repo);
    await repo.saveIncome('2026-01', { id: 'i1', source: 'Salário', amount: 1000 });

    await repo.closeMonth('2026-01', true);

    expect(await repo.listMonths()).toEqual(['2026-01', '2026-02']);
    expect((await repo.getMonth('2026-01'))?.closed).toBe(true);
    const february = (await repo.getMonth('2026-02'))!;
    expect(february.closed).toBe(false);
    // 20% of 1000, with nothing spent, is what Diversos carries into February.
    expect(february.carryIn[diversos]).toBe(200);
  });

  it('closes without opening the next month when not asked to', async () => {
    const { repo } = await newAccount();
    await repo.closeMonth('2026-01');
    expect(await repo.listMonths()).toEqual(['2026-01']);
  });

  it('applies concurrent writes to the same month without losing any', async () => {
    const { repo } = await newAccount();
    await repo.ensureMonth('2026-01');
    await Promise.all(
      Array.from({ length: 8 }, (_, n) =>
        repo.saveExpense('2026-01', fixedCost({ id: `e${n}`, amount: n + 1 })),
      ),
    );
    const month = (await repo.getMonth('2026-01'))!;
    expect(month.expenses).toHaveLength(8);
    expect(computeMonthSummary(month).fixedTotal).toBe(36);
  });
});
