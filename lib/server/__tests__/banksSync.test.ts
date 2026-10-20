// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncAndNotify } from '../banks/alerts';
import { runBanksJob } from '../banks/job';
import type { FetchLike } from '../banks/pluggy';
import { PostgresBanksRepository } from '../banks/repository';
import { forgetPluggyKey, syncUser } from '../banks/service';
import * as schema from '../db/schema';
import type { Database } from '../db/types';

/**
 * F2 of Open Finance: the sync. Pluggy is faked with the answers it really gives (see the F0 notes
 * in the README): a card purchase positive, a pending one that later posts, a Pix with the payer's
 * document and no name.
 */

type Answer = { status?: number; body: unknown };

function fakePluggy(routes: Record<string, Answer | ((path: string) => Answer)>) {
  const calls: { method: string; path: string }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(input).replace('https://api.pluggy.ai', '');
    calls.push({ method, path });
    const route = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`];
    const answer = typeof route === 'function' ? route(path) : route;
    if (!answer) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as unknown as FetchLike;
  return { fetchImpl, calls };
}

let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

beforeEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', randomBytes(32).toString('base64'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function newPerson() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Pessoa', email: `${id}@teste.local` });
  forgetPluggyKey(id);
  return { id, banks: new PostgresBanksRepository(db, id) };
}

const ITEM = '6f1c2c3e-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-20T15:00:00Z');
const FIRST = '2026-10-20T12:57:28.616Z';
const SECOND = '2026-10-21T13:10:00.000Z';

const accounts = {
  results: [
    {
      id: 'acc-1',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      name: 'BTG Banking',
      balance: 1234.56,
      currencyCode: 'BRL',
      bankData: { transferNumber: '208/0001/1234567-8' },
    },
    {
      id: 'acc-2',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      name: 'Cartão BTG GOLD',
      balance: 300,
      currencyCode: 'BRL',
      creditData: { creditLimit: 5000, availableCreditLimit: 4700, balanceDueDate: '2026-11-09T03:00:00.000Z' },
    },
  ],
};

const purchase = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-card-1',
  date: '2026-10-18T03:00:00.000Z',
  amount: 45.9,
  currencyCode: 'BRL',
  description: 'IFOOD *RESTAURANTE',
  descriptionRaw: null,
  type: 'DEBIT',
  status: 'PENDING',
  category: 'Food delivery',
  operationType: 'PAGAMENTO',
  paymentData: null,
  merchant: null,
  creditCardMetadata: { totalInstallments: 3, installmentNumber: 1, purchaseDate: '2026-10-18T03:00:00.000Z' },
  ...overrides,
});

const pix = {
  id: 'tx-pix-1',
  date: '2026-10-19T03:00:00.000Z',
  amount: 50,
  description: 'PIX RECEBIDO',
  descriptionRaw: 'PIX RECEBIDO JOAO',
  type: 'CREDIT',
  status: 'POSTED',
  category: 'Transfer - PIX',
  operationType: 'PIX',
  paymentData: { paymentMethod: 'PIX', payer: { name: null, documentNumber: { type: 'CPF', value: '***123***' } } },
};

/** A bank that already arrived, and a Pluggy that has `item()` and `transactionsOf(path)`. */
async function arrivedBank(transactionsOf: (path: string) => unknown[], item: () => Record<string, unknown>) {
  const { id, banks } = await newPerson();
  await banks.saveKey('id', 'segredo');
  await banks.addPending(ITEM, null);
  await banks.updateConnection(ITEM, { status: 'ok', lastUpdatedAt: new Date(FIRST) });
  const fake = fakePluggy({
    'POST /auth': { body: { apiKey: 'chave' } },
    [`GET /items/${ITEM}`]: () => ({ body: { id: ITEM, ...item() } }),
    'GET /accounts': { body: accounts },
    'GET /v2/transactions': (path) => ({ body: { results: transactionsOf(path), next: null } }),
  });
  return { id, banks, ...fake };
}

function storedTransactions(userId: string) {
  return db
    .select()
    .from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.userId, userId))
    .orderBy(schema.bankTransactions.transactionId);
}

describe('the sync', () => {
  it('reads a year of transactions the first time, as Pluggy sends them', async () => {
    const { id, banks, calls, fetchImpl } = await arrivedBank(
      (path) => (path.includes('accountId=acc-2') ? [purchase()] : [pix]),
      () => ({ status: 'UPDATED', lastUpdatedAt: FIRST, consentExpiresAt: '2027-10-20T13:19:34.167Z' }),
    );

    const results = await syncUser(banks, id, fetchImpl, NOW);
    expect(results).toEqual([{ itemId: ITEM, changed: true, added: ['tx-pix-1', 'tx-card-1'], firstRead: true }]);
    expect(calls.filter((call) => call.path.startsWith('/v2/transactions')).map((call) => call.path)).toEqual([
      '/v2/transactions?accountId=acc-1&dateFrom=2025-10-20&dateTo=2026-10-20',
      '/v2/transactions?accountId=acc-2&dateFrom=2025-10-20&dateTo=2026-10-20',
    ]);

    const [card, received] = await storedTransactions(id);
    expect(card).toMatchObject({
      accountId: 'acc-2',
      date: '2026-10-18',
      amount: 45.9,
      type: 'DEBIT',
      status: 'PENDING',
      totalInstallments: 3,
      installmentNumber: 1,
      purchaseDate: '2026-10-18',
      outcome: null,
    });
    expect(received).toMatchObject({ amount: 50, paymentMethod: 'PIX', payerName: null, payerDocument: '***123***' });

    const [connection] = await banks.listConnections();
    expect(connection.consentExpiresAt).toBe('2027-10-20T13:19:34.167Z');
    expect(connection.accounts).toEqual([
      expect.objectContaining({ id: 'acc-1', balance: 1234.56, balanceAt: FIRST }),
      expect.objectContaining({
        id: 'acc-2',
        kind: 'card',
        balance: 300,
        creditLimit: 5000,
        availableCredit: 4700,
        dueDate: '2026-11-09',
      }),
    ]);
  });

  it('only asks "anything new?" while the bank sent nothing, and reads 7 days back when it did', async () => {
    let lastUpdatedAt = FIRST;
    let card = purchase();
    const { id, banks, calls, fetchImpl } = await arrivedBank(
      (path) => (path.includes('accountId=acc-2') ? [card] : []),
      () => ({ status: 'UPDATED', lastUpdatedAt }),
    );
    await syncUser(banks, id, fetchImpl, NOW);
    // The person already dealt with it: a later read must not undo that.
    await db
      .update(schema.bankTransactions)
      .set({ outcome: 'ignored' })
      .where(eq(schema.bankTransactions.transactionId, 'tx-card-1'));

    calls.length = 0;
    expect(await syncUser(banks, id, fetchImpl, NOW)).toEqual([
      { itemId: ITEM, changed: false, added: [], firstRead: false },
    ]);
    expect(calls.map((call) => call.path)).toEqual([`/items/${ITEM}`]);

    lastUpdatedAt = SECOND;
    card = purchase({ status: 'POSTED', creditCardMetadata: { billId: 'bill-1' } });
    calls.length = 0;
    expect(await syncUser(banks, id, fetchImpl, new Date('2026-10-21T15:00:00Z'))).toEqual([
      { itemId: ITEM, changed: true, added: [], firstRead: false },
    ]);
    expect(calls.find((call) => call.path.includes('accountId=acc-2'))?.path).toBe(
      '/v2/transactions?accountId=acc-2&dateFrom=2026-10-13&dateTo=2026-10-21',
    );
    const rows = await storedTransactions(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'POSTED', billId: 'bill-1', outcome: 'ignored' });
  });

  it('keeps the status while Pluggy updates, and asks to bring again a bank gone at Pluggy', async () => {
    let gone = false;
    const { id, banks, fetchImpl } = await arrivedBank(
      () => [],
      () => (gone ? { status: 'GONE' } : { status: 'UPDATING', lastUpdatedAt: FIRST }),
    );
    await syncUser(banks, id, fetchImpl, NOW);
    expect((await banks.listConnections())[0].status).toBe('ok');

    gone = true;
    const missing = fakePluggy({
      'POST /auth': { body: { apiKey: 'chave' } },
      [`GET /items/${ITEM}`]: { status: 404, body: { message: 'Item not found' } },
    });
    await syncUser(banks, id, missing.fetchImpl, NOW);
    expect((await banks.listConnections())[0].status).toBe('reconnect');
  });

  it('a read that comes back without accounts keeps the ones it had', async () => {
    let empty = false;
    const { id, banks } = await arrivedBank(
      () => [],
      () => ({ status: 'UPDATED', lastUpdatedAt: empty ? SECOND : FIRST }),
    );
    const { fetchImpl } = fakePluggy({
      'POST /auth': { body: { apiKey: 'chave' } },
      [`GET /items/${ITEM}`]: () => ({ body: { id: ITEM, status: 'UPDATED', lastUpdatedAt: empty ? SECOND : FIRST } }),
      'GET /accounts': () => ({ body: empty ? { results: [] } : accounts }),
      'GET /v2/transactions': { body: { results: [], next: null } },
    });
    await syncUser(banks, id, fetchImpl, NOW);
    empty = true;
    await syncUser(banks, id, fetchImpl, NOW);
    expect((await banks.listConnections())[0].accounts).toHaveLength(2);
  });

  it('never runs twice at the same time for the same person', async () => {
    const { id, banks, fetchImpl } = await arrivedBank(
      () => [],
      () => ({ status: 'UPDATED', lastUpdatedAt: FIRST }),
    );
    const results = await Promise.all([syncUser(banks, id, fetchImpl, NOW), syncUser(banks, id, fetchImpl, NOW)]);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });
});

describe('the Reserva fed by the banks', () => {
  async function cashReserve(userId: string) {
    const [row] = await db.select().from(schema.cashSettings).where(eq(schema.cashSettings.userId, userId));
    return row?.reserveAccountAmount ?? null;
  }

  it('nothing comes marked; marking writes the sum, a sync keeps it, unmarking leaves the value', async () => {
    let balance = 1234.56;
    const { id, banks } = await arrivedBank(
      () => [],
      () => ({ status: 'UPDATED', lastUpdatedAt: balance === 1234.56 ? FIRST : SECOND }),
    );
    const { fetchImpl } = fakePluggy({
      'POST /auth': { body: { apiKey: 'chave' } },
      [`GET /items/${ITEM}`]: () => ({
        body: { id: ITEM, status: 'UPDATED', lastUpdatedAt: balance === 1234.56 ? FIRST : SECOND },
      }),
      'GET /accounts': () => ({
        body: { results: [{ ...accounts.results[0], balance }, accounts.results[1]] },
      }),
      'GET /investments': {
        body: {
          results: [
            { id: 'inv-cdb', name: 'CDB NU FINANCEIRA', type: 'FIXED_INCOME', subtype: 'CDB', balance: 500.5 },
            { id: 'inv-stock', name: 'PETR4', type: 'EQUITY', subtype: 'STOCK', balance: 80 },
          ],
        },
      },
      'GET /v2/transactions': { body: { results: [], next: null } },
    });
    await syncUser(banks, id, fetchImpl, NOW);

    const offered = await banks.reserve();
    expect(offered.total).toBeNull();
    expect(offered.banks[0].sources.map((s) => [s.id, s.detail, s.usual, s.marked])).toEqual([
      ['acc-1', 'conta', true, false],
      ['inv-cdb', 'CDB', true, false],
      ['inv-stock', 'ação', false, false],
    ]);
    expect(await cashReserve(id)).toBeNull();

    await banks.setReserveSources(['acc-1'], ['inv-cdb']);
    expect(await banks.writeReserve()).toBe(1735.06);
    expect(await cashReserve(id)).toBe(1735.06);

    // The next day the bank sends a new balance: the Reserva follows.
    balance = 2000;
    await syncUser(banks, id, fetchImpl, new Date('2026-10-21T15:00:00Z'));
    expect(await cashReserve(id)).toBe(2500.5);

    // Back to typing it: the marks go, the last value stays for the person to edit.
    await banks.setReserveSources([], []);
    expect(await banks.writeReserve()).toBeNull();
    expect((await banks.reserve()).total).toBeNull();
    expect(await cashReserve(id)).toBe(2500.5);
  });
});

describe('the alerts', () => {
  async function bankNotifications(userId: string) {
    return db
      .select({ title: schema.notifications.title, body: schema.notifications.body, key: schema.notifications.sourceKey })
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(schema.notifications.title);
  }
  const plain = (text: string) => text.replace(/ /g, ' ');

  it('tell what arrived after the first read, one summary per bank, and the salary on its own', async () => {
    let lastUpdatedAt = FIRST;
    let card: unknown[] = [purchase({ id: 'old-purchase', date: '2026-01-10T03:00:00.000Z' })];
    let bank: unknown[] = [];
    const { id, banks, fetchImpl } = await arrivedBank(
      (path) => (path.includes('accountId=acc-2') ? card : bank),
      () => ({ status: 'UPDATED', lastUpdatedAt, consentExpiresAt: '2027-10-20T13:19:34.167Z' }),
    );

    // The first read is a year of history: no news.
    await syncAndNotify(db, id, fetchImpl, NOW);
    expect(await bankNotifications(id)).toEqual([]);

    // The person points at last month's salary.
    await db.insert(schema.bankTransactions).values({
      userId: id,
      transactionId: 'salary-sep',
      accountId: 'acc-1',
      date: '2026-09-30',
      amount: 5000,
      description: 'TED RECEBIDA EMPRESA',
      type: 'CREDIT',
      status: 'POSTED',
      payerDocument: '12.345.678/0001-90',
    });
    const refs = await banks.salaryRefs(['salary-sep'], []);
    await banks.saveAlertSettings({ ...(await banks.alertSettings()), salaries: refs });

    // Next day: two purchases, a Pix received and the salary.
    lastUpdatedAt = SECOND;
    card = [
      purchase({ id: 'p1', amount: 45.9, date: '2026-10-20T03:00:00.000Z' }),
      purchase({ id: 'p2', amount: 74.1, date: '2026-10-21T03:00:00.000Z' }),
    ];
    bank = [
      { ...pix, id: 'pix-2', date: '2026-10-21T03:00:00.000Z' },
      {
        ...pix,
        id: 'salary-oct',
        amount: 5100,
        description: 'TED RECEBIDA EMPRESA',
        paymentData: { paymentMethod: 'TED', payer: { documentNumber: { value: '12.345.678/0001-90' } } },
      },
    ];
    await syncAndNotify(db, id, fetchImpl, new Date('2026-10-21T15:00:00Z'));

    const told = (await bankNotifications(id)).map((n) => ({ title: n.title, body: plain(n.body) }));
    expect(told).toEqual([
      { title: '🏦 BTG Pactual', body: 'Chegaram 2 compras no cartão (R$ 120,00) e 1 Pix recebido (R$ 50,00).' },
      { title: '💰 Seu salário caiu', body: 'R$ 5.100,00 · BTG Pactual' },
    ]);

    // Reading again brings nothing new, and nothing is told twice.
    await syncAndNotify(db, id, fetchImpl, new Date('2026-10-21T16:00:00Z'));
    expect(await bankNotifications(id)).toHaveLength(2);
  });

  it('a bank that stopped and an authorization running out are told once each', async () => {
    const { id, banks, fetchImpl } = await arrivedBank(
      () => [],
      () => ({
        status: 'UPDATED',
        lastUpdatedAt: '2026-10-17T12:00:00.000Z',
        consentExpiresAt: '2026-10-30T12:00:00.000Z',
      }),
    );
    await banks.updateConnection(ITEM, { status: 'ok', suggestedName: 'BTG Pactual' });
    await syncAndNotify(db, id, fetchImpl, NOW);
    await syncAndNotify(db, id, fetchImpl, new Date(NOW.getTime() + 60 * 60_000));
    const told = await bankNotifications(id);
    expect(told.map((n) => n.title)).toEqual(['🏦 BTG Pactual parou', '🏦 BTG Pactual: autorização vencendo']);
    expect(told.map((n) => n.body)).toEqual([
      'Nenhum dado novo do banco há 3 dias. Toque para reconectar no Meu Pluggy.',
      'A autorização vence em 10 dias. Toque para renovar.',
    ]);
  });
});

describe('the hourly job', () => {
  it('reads only VIPs with the module on, once an hour, and one failure stops nobody', async () => {
    const vip = await newPerson();
    const notVip = await newPerson();
    const broken = await newPerson();
    for (const person of [broken, vip, notVip]) {
      await db.insert(schema.budgetSettings).values({
        userId: person.id,
        topics: [],
        specialCategories: { fixedCost: 'Custo Fixo', unforeseen: 'Imprevistos' },
        modules: { banks: true },
      });
      await person.banks.saveKey(person === broken ? 'quebrada' : 'id', 'segredo');
      await person.banks.addPending(`${person.id}-item`, null);
      await person.banks.updateConnection(`${person.id}-item`, { status: 'ok' });
    }
    await db.insert(schema.vipUsers).values([{ userId: vip.id }, { userId: broken.id }]);

    const asked: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input).replace('https://api.pluggy.ai', '');
      if (path === '/auth') {
        const { clientId } = JSON.parse(String(init?.body)) as { clientId: string };
        if (clientId === 'quebrada') return new Response('{"message":"boom"}', { status: 500 });
        return new Response('{"apiKey":"chave"}');
      }
      asked.push(path);
      return new Response(JSON.stringify({ id: 'x', status: 'UPDATING' }));
    }) as unknown as FetchLike;

    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = await runBanksJob(db, NOW, fetchImpl);
    errors.mockRestore();
    expect(run.results.map((result) => result.userId)).toEqual([vip.id]);
    expect(asked).toEqual([`/items/${vip.id}-item`]);

    // Within the hour, nothing runs again.
    expect((await runBanksJob(db, new Date(NOW.getTime() + 30 * 60_000), fetchImpl)).results).toEqual([]);
  });
});
