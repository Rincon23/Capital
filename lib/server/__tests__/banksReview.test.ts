// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallmentPlan } from '@/lib/budget';
import { addDays, zonedToday } from '@/lib/reminders/time';
import { PostgresBanksRepository, type StoredTransaction } from '../banks/repository';
import { applyReviewAction, buildReview } from '../banks/review';
import { PostgresBudgetRepository } from '../budgetRepository';
import * as schema from '../db/schema';
import type { Database } from '../db/types';
import { PostgresWalletRepository } from '../walletRepository';

/**
 * F5 of Open Finance: "Confira os gastos". The transactions are stored as the sync stores them;
 * the review sorts them, and each decision goes through the same functions the forms use.
 */

let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  // No quote is ever fetched here.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('sem rede nos testes')));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const TODAY = zonedToday();
const day = (offset: number) => addDays(TODAY, offset);

async function newPerson() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Pessoa', email: `${id}@teste.local` });
  const repo = new PostgresBudgetRepository(db, id);
  const wallet = new PostgresWalletRepository(db, id, repo);
  const banks = new PostgresBanksRepository(db, id);
  await banks.addPending('item', null);
  await banks.updateConnection('item', { status: 'ok', suggestedName: 'Nubank' });
  await banks.replaceAccounts('item', [
    { accountId: 'conta', kind: 'checking', name: 'Conta Nubank', balance: 100, currency: 'BRL' },
    { accountId: 'cartao', kind: 'card', name: 'Cartão Gold', balance: 300, currency: 'BRL' },
  ]);
  await wallet.saveCard({
    id: 'nubank',
    name: 'Nubank',
    dueDay: 10,
    dueMonth: 'next',
    notifyEnabled: false,
    notifyBeforeDays: 0,
    isDefault: true,
    order: 0,
  });
  return { id, repo, wallet, banks, deps: { banks, repo, wallet } };
}

let seq = 0;
function tx(overrides: Partial<StoredTransaction>): StoredTransaction {
  seq += 1;
  return {
    transactionId: `tx-${seq}`,
    accountId: 'conta',
    date: day(-1),
    amount: -10,
    currency: 'BRL',
    description: 'ALGO',
    descriptionRaw: null,
    type: 'DEBIT',
    status: 'POSTED',
    category: null,
    operationType: null,
    paymentMethod: null,
    payerName: null,
    payerDocument: null,
    receiverName: null,
    receiverDocument: null,
    merchantName: null,
    installmentNumber: null,
    totalInstallments: null,
    purchaseDate: null,
    billId: null,
    ...overrides,
  };
}

async function outcomeOf(transactionId: string) {
  const [row] = await db
    .select({ outcome: schema.bankTransactions.outcome, entryId: schema.bankTransactions.entryId })
    .from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.transactionId, transactionId));
  return row;
}

describe('"Confira os gastos"', () => {
  it('sorts what arrived: what to launch, a split purchase in one line, and what is left out', async () => {
    const { banks, deps } = await newPerson();
    const instalments = Array.from({ length: 10 }, (_, index) =>
      tx({
        transactionId: `parc-${index + 1}`,
        accountId: 'cartao',
        description: `LOJA ${index + 1}/10`,
        amount: index === 0 ? 87.29 : 87.23,
        date: day(-2),
        purchaseDate: day(-2),
        installmentNumber: index + 1,
        totalInstallments: 10,
      }),
    );
    await banks.upsertTransactions([
      tx({ transactionId: 'compra', accountId: 'cartao', amount: 45.9, description: 'IFOOD', category: 'Food delivery' }),
      tx({ transactionId: 'pix-in', amount: 50, type: 'CREDIT', paymentMethod: 'PIX', payerName: 'João' }),
      tx({ transactionId: 'fatura', amount: -1200, category: 'Credit card payment', description: 'PAGAMENTO FATURA' }),
      tx({ transactionId: 'minha', amount: -500, category: 'Same person transfer' }),
      tx({ transactionId: 'antiga', amount: -99, date: day(-30) }),
      ...instalments,
    ]);

    const review = await buildReview(deps);
    // Newest first; on the same day, the bigger amount first.
    expect(review.items.map((item) => [item.key, item.kind, item.amount])).toEqual([
      ['pix-in', 'income', 50],
      ['compra', 'expense', 45.9],
      ['parc-1', 'plan', 872.36],
    ]);
    expect(review.items.find((item) => item.kind === 'plan')?.transactionIds).toHaveLength(10);
    expect(review.ignored.map((item) => [item.key, item.ignored?.reason])).toEqual([
      ['fatura', 'bill_payment'],
      ['minha', 'own_transfer'],
    ]);
    // Older than a week before the bank was brought in: history, not news.
    expect([...review.items, ...review.ignored].some((item) => item.key === 'antiga')).toBe(false);
    expect(review.cards).toEqual([
      { accountId: 'cartao', name: 'Cartão Gold', bankName: 'Nubank', cardId: null, linked: false },
    ]);
  });

  it('launches through the same save the form uses, once, and remembers the category', async () => {
    const { repo, banks, deps } = await newPerson();
    await banks.linkCard('cartao', 'nubank');
    await banks.upsertTransactions([
      tx({ transactionId: 'mercado', accountId: 'cartao', amount: 87.96, description: 'ASSAI ATACADISTA 123', date: day(-1) }),
    ]);
    const [item] = (await buildReview(deps)).items;
    expect(item).toMatchObject({ onCard: true, cardId: 'nubank', category: null });

    const settings = await repo.getSettings();
    const diversos = settings.topics.find((topic) => topic.name === 'Diversos')!.id;
    const month = item.date.slice(0, 7);
    const expense = {
      id: randomUUID(),
      categoryKind: 'topic' as const,
      topicId: diversos,
      description: 'Mercado',
      amount: item.amount,
      date: item.date,
      singleInstallmentCard: true,
      cardId: 'nubank',
    };
    await applyReviewAction(deps, { action: 'expense', transactionIds: item.transactionIds, month, expense });

    const saved = (await repo.getMonth(month))!.expenses.find((entry) => entry.id === expense.id);
    expect(saved).toMatchObject({ amount: 87.96, cardId: 'nubank', singleInstallmentCard: true, source: 'import' });
    expect(await outcomeOf('mercado')).toEqual({ outcome: 'expense', entryId: expense.id });

    // A second tap (or another device) never makes a second entry.
    await expect(
      applyReviewAction(deps, { action: 'expense', transactionIds: ['mercado'], month, expense: { ...expense, id: randomUUID() } }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
    expect((await repo.getMonth(month))!.expenses).toHaveLength(1);

    // The next purchase that reads the same comes with the category chosen.
    await banks.upsertTransactions([
      tx({ transactionId: 'mercado-2', accountId: 'cartao', amount: 30, description: 'ASSAI ATACADISTA 456', date: TODAY }),
    ]);
    const [next] = (await buildReview(deps)).items;
    expect(next.category).toMatchObject({ categoryKind: 'topic', topicId: diversos });
  });

  it('spots the entry the person already made, and "É o mesmo" ties them', async () => {
    const { repo, banks, deps } = await newPerson();
    const month = day(-1).slice(0, 7);
    const settings = await repo.getSettings();
    await repo.saveExpense(month, {
      id: 'manual',
      categoryKind: 'topic',
      topicId: settings.topics[0].id,
      description: 'Pizza',
      amount: 60,
      date: day(-1),
    });
    await banks.upsertTransactions([tx({ transactionId: 'pizza', amount: -60, description: 'PIX PIZZARIA', date: day(0) })]);

    const [item] = (await buildReview(deps)).items;
    expect(item.duplicate).toMatchObject({ entryId: 'manual', description: 'Pizza', amount: 60 });
    await applyReviewAction(deps, { action: 'linked', transactionIds: ['pizza'], month, entryId: 'manual' });
    expect(await outcomeOf('pizza')).toEqual({ outcome: 'linked', entryId: 'manual' });
    expect((await repo.getMonth(month))!.expenses).toHaveLength(1);
  });

  it('a split purchase becomes a plan, and its next instalments are recognised', async () => {
    const { wallet, banks, deps, repo } = await newPerson();
    await banks.linkCard('cartao', 'nubank');
    await banks.upsertTransactions([
      tx({
        transactionId: 'curso-1',
        accountId: 'cartao',
        description: 'CURSO 01/03',
        amount: 100,
        date: day(-1),
        purchaseDate: day(-1),
        installmentNumber: 1,
        totalInstallments: 3,
      }),
    ]);
    const [item] = (await buildReview(deps)).items;
    const settings = await repo.getSettings();
    const plan: InstallmentPlan = {
      id: randomUUID(),
      name: 'Curso',
      categoryKind: 'topic',
      topicId: settings.topics[0].id,
      firstDebitDate: addDays(TODAY, 20),
      purchaseDate: item.installments!.purchaseDate,
      count: 3,
      totalAmount: item.installments!.total,
      accounting: 'upfront',
      cardId: 'nubank',
    };
    await applyReviewAction(deps, { action: 'plan', transactionIds: item.transactionIds, plan });
    expect((await wallet.listInstallments()).map((saved) => saved.id)).toEqual([plan.id]);

    // Next month the bank sends instalment 2: it is the same purchase, left out with the reason.
    await banks.upsertTransactions([
      tx({
        transactionId: 'curso-2',
        accountId: 'cartao',
        description: 'CURSO 02/03',
        amount: 100,
        date: TODAY,
        purchaseDate: item.installments!.purchaseDate,
        installmentNumber: 2,
        totalInstallments: 3,
      }),
    ]);
    const review = await buildReview(deps);
    expect(review.items).toEqual([]);
    expect(review.ignored[0].ignored).toMatchObject({ reason: 'in_plan' });
  });

  it('a Pix that pays back an "A receber" is offered as such, and marking it uses the same "Já me pagou"', async () => {
    const { repo, banks, deps } = await newPerson();
    // The "A receber" module on, and an open one: dinner paid for João.
    await repo.saveSettings({ ...(await repo.getSettings()), modules: { expenses: true, reimbursable: true } });
    const month = day(-3).slice(0, 7);
    await repo.saveExpense(month, {
      id: 'jantar',
      categoryKind: 'reimbursable',
      description: 'Jantar — João',
      amount: 50,
      date: day(-3),
    });
    await banks.upsertTransactions([
      tx({ transactionId: 'pix-joao', amount: 50, type: 'CREDIT', paymentMethod: 'PIX', payerName: 'JOAO SILVA' }),
    ]);

    const [item] = (await buildReview(deps)).items;
    expect(item).toMatchObject({
      kind: 'income',
      reimbursement: { expenseId: 'jantar', description: 'Jantar — João', amount: 50, month },
    });

    await applyReviewAction(deps, { action: 'reimbursed', transactionIds: ['pix-joao'], month, expenseId: 'jantar' });
    expect(await outcomeOf('pix-joao')).toEqual({ outcome: 'reimbursed', entryId: 'jantar' });
    expect((await repo.pendingReimbursables(month)).map((pending) => pending.expense.id)).toEqual([]);
    // Nothing else was launched: no income, the dinner is just marked as paid back.
    expect((await repo.getMonth(month))!.incomes).toEqual([]);
  });

  it('a Pix a little off settles an "A receber": the rest becomes income, what was missing Imprevistos', async () => {
    const { repo, banks, deps } = await newPerson();
    await repo.saveSettings({ ...(await repo.getSettings()), modules: { expenses: true, reimbursable: true } });
    const month = day(-3).slice(0, 7);
    const owe = (id: string, description: string, amount: number) =>
      repo.saveExpense(month, { id, categoryKind: 'reimbursable', description, amount, date: day(-3) });
    await owe('jantar', 'Jantar — João', 35.67);
    await owe('cinema', 'Cinema — Maria', 52.4);
    await banks.upsertTransactions([
      tx({ transactionId: 'pix-36', amount: 36, type: 'CREDIT', paymentMethod: 'PIX', payerDocument: '***111***' }),
      tx({ transactionId: 'pix-50', amount: 50, type: 'CREDIT', paymentMethod: 'PIX', payerDocument: '***222***' }),
    ]);

    const review = await buildReview(deps);
    const byId = (id: string) => review.items.find((item) => item.transactionIds[0] === id)!;
    expect(byId('pix-36').reimbursement).toMatchObject({ expenseId: 'jantar', difference: 0.33, others: [] });
    expect(byId('pix-50').reimbursement).toMatchObject({ expenseId: 'cinema', difference: -2.4 });

    await applyReviewAction(deps, { action: 'reimbursed', transactionIds: ['pix-36'], month, expenseId: 'jantar' });
    await applyReviewAction(deps, { action: 'reimbursed', transactionIds: ['pix-50'], month, expenseId: 'cinema' });
    expect((await repo.pendingReimbursables(month)).map((pending) => pending.expense.id)).toEqual([]);
    const pixMonth = day(-1).slice(0, 7);
    const data = (await repo.getMonth(pixMonth))!;
    expect(data.incomes).toEqual([
      expect.objectContaining({ source: 'Devolução a mais: Jantar — João', amount: 0.33, date: day(-1) }),
    ]);
    expect(data.expenses.filter((expense) => expense.categoryKind === 'unforeseen')).toEqual([
      expect.objectContaining({ description: 'Faltou na devolução: Cinema — Maria', amount: 2.4, date: day(-1) }),
    ]);

    // Next time the same CPF sends a Pix, the "A receber" that speaks of João comes first.
    await owe('uber-maria', 'Uber — Maria', 20);
    await owe('uber-joao', 'Uber — João', 21);
    await banks.upsertTransactions([
      tx({ transactionId: 'pix-20', amount: 20, type: 'CREDIT', paymentMethod: 'PIX', payerDocument: '***111***' }),
    ]);
    const [again] = (await buildReview(deps)).items;
    expect(again.reimbursement).toMatchObject({
      expenseId: 'uber-joao',
      difference: -1,
      others: [expect.objectContaining({ expenseId: 'uber-maria', difference: 0 })],
    });
  });

  it('refuses an "A receber" too far from the Pix, and launches nothing', async () => {
    const { repo, banks, deps } = await newPerson();
    await repo.saveSettings({ ...(await repo.getSettings()), modules: { expenses: true, reimbursable: true } });
    const month = day(-3).slice(0, 7);
    await repo.saveExpense(month, { id: 'viagem', categoryKind: 'reimbursable', description: 'Viagem', amount: 300, date: day(-3) });
    await banks.upsertTransactions([tx({ transactionId: 'pix-10', amount: 10, type: 'CREDIT', paymentMethod: 'PIX' })]);
    await expect(
      applyReviewAction(deps, { action: 'reimbursed', transactionIds: ['pix-10'], month, expenseId: 'viagem' }),
    ).rejects.toMatchObject({ code: 'TOO_FAR' });
    expect(await outcomeOf('pix-10')).toEqual({ outcome: null, entryId: null });
    expect((await repo.pendingReimbursables(month)).map((pending) => pending.expense.id)).toEqual(['viagem']);
  });

  it('a launch that fails gives the transaction back to the list', async () => {
    const { repo, banks, deps } = await newPerson();
    await banks.upsertTransactions([tx({ transactionId: 'fechado', amount: -20, date: day(-1) })]);
    const month = day(-1).slice(0, 7);
    await repo.closeMonth(month);
    const settings = await repo.getSettings();
    await expect(
      applyReviewAction(deps, {
        action: 'expense',
        transactionIds: ['fechado'],
        month,
        expense: {
          id: randomUUID(),
          categoryKind: 'topic',
          topicId: settings.topics[0].id,
          description: 'X',
          amount: 20,
          date: day(-1),
        },
      }),
    ).rejects.toThrow();
    expect(await outcomeOf('fechado')).toEqual({ outcome: null, entryId: null });

    await applyReviewAction(deps, { action: 'ignore', transactionIds: ['fechado'] });
    expect(await outcomeOf('fechado')).toEqual({ outcome: 'ignored', entryId: null });
  });
});
