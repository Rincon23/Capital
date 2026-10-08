// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMonthKey, todayISO } from '@/lib/budget';
import { RECOMMENDED_QUESTIONS, type AssetInput } from '@/lib/diagram';
import { clearAccountData } from '../accountData';
import { PostgresBudgetRepository } from '../budgetRepository';
import * as schema from '../db/schema';
import type { Database } from '../db/types';
import { PostgresDiagramRepository } from '../diagramRepository';
import { parseYahooSearch } from '../quotes';

let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

// No test ever reaches B3 or Yahoo: the network is off.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('sem rede nos testes')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function newAccount() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Teste', email: `${id}@teste.local` });
  const budget = new PostgresBudgetRepository(db, id);
  return { id, budget, diagram: new PostgresDiagramRepository(db, id, budget) };
}

async function setPrice(ticker: string, price: number) {
  const values = { price, fetchedAt: new Date() };
  await db
    .insert(schema.priceCache)
    .values({ ticker, ...values })
    .onConflictDoUpdate({ target: schema.priceCache.ticker, set: values });
}

function asset(overrides: Partial<AssetInput> = {}): AssetInput {
  return {
    type: 'brStocks',
    ticker: 'WEGE3',
    quantity: 10,
    stopBuying: false,
    isEtf: false,
    directScore: null,
    ...overrides,
  };
}

describe('PostgresDiagramRepository', () => {
  it('starts empty: no targets, no assets, no questions', async () => {
    const { diagram } = await newAccount();
    const overview = await diagram.getOverview();
    expect(overview.settings).toEqual({ targets: {}, lastAmount: null });
    expect(overview.assets).toEqual([]);
    expect(overview.questions).toEqual([]);
  });

  it('only saves targets that add up to 100%, and a type left out is out of the portfolio', async () => {
    const { diagram } = await newAccount();
    await expect(diagram.saveTargets({ brStocks: 0.5, fiis: 0.4 })).rejects.toMatchObject({ code: 'TARGETS_NOT_100' });
    await diagram.saveTargets({ brStocks: 0.6, fiis: 0.4, crypto: 0 });
    expect((await diagram.getOverview()).settings.targets).toEqual({ brStocks: 0.6, fiis: 0.4, crypto: 0 });
  });

  it('normalizes the ticker, refuses a duplicate and converts US$ prices with the dollar', async () => {
    const { diagram } = await newAccount();
    const added = await diagram.addAsset(asset({ type: 'intlStocks', ticker: 'bats:wtai', quantity: 2 }), todayISO());
    expect(added.ticker).toBe('WTAI');
    await expect(diagram.addAsset(asset({ type: 'intlStocks', ticker: 'WTAI' }), todayISO())).rejects.toMatchObject({
      code: 'DUPLICATE_ASSET',
    });
    await setPrice('US:WTAI', 43.6);
    await setPrice('FX:USDBRL', 5);
    const overview = await diagram.getOverview();
    expect(overview.quotes[added.id].price).toBeCloseTo(218, 6);
    expect(overview.dollar?.price).toBe(5);
  });

  it('copies the recommended questions into one type only, once', async () => {
    const { diagram } = await newAccount();
    expect(await diagram.useRecommended('fiis')).toBe(RECOMMENDED_QUESTIONS.fiis.length);
    expect(await diagram.useRecommended('fiis')).toBe(0);
    const questions = (await diagram.getOverview()).questions;
    expect(questions.every((question) => question.type === 'fiis')).toBe(true);
    expect(questions.map((question) => question.position)).toEqual(questions.map((_, index) => index));
  });

  it('drops the answers with the question removed, and refuses a question of another type', async () => {
    const { diagram } = await newAccount();
    const wege = await diagram.addAsset(asset(), todayISO());
    const roe = await diagram.addQuestion({ type: 'brStocks', criterion: 'ROE', text: 'ROE > 10%?', weight: 1 });
    const pvp = await diagram.addQuestion({ type: 'fiis', criterion: 'P/VP', text: 'P/VP < 1?', weight: 1 });
    await diagram.setAnswer(wege.id, roe.id, 1);
    await expect(diagram.setAnswer(wege.id, pvp.id, 1)).rejects.toMatchObject({ code: 'WRONG_TYPE' });
    expect((await diagram.getOverview()).answers[wege.id]).toEqual({ [roe.id]: 1 });
    await diagram.deleteQuestion(roe.id);
    expect((await diagram.getOverview()).answers[wege.id]).toBeUndefined();
  });

  it('adds the quotas of an aporte, keeps it in the history and can launch it in Investimentos', async () => {
    const { budget, diagram } = await newAccount();
    await budget.saveSettings({ ...(await budget.getSettings()), modules: { expenses: true } });
    const wege = await diagram.addAsset(asset({ quantity: 10 }), '2026-01-01');
    await setPrice('WEGE3', 50);

    const contribution = await diagram.contribute({
      date: todayISO(),
      month: currentMonthKey(),
      items: [
        { assetId: wege.id, type: 'brStocks', quantity: 3 },
        { type: 'fixedIncome', quantity: 200 },
      ],
      launchExpense: true,
    });
    expect(contribution.amount).toBe(350);

    const overview = await diagram.getOverview();
    expect(overview.assets[0]).toMatchObject({ quantity: 13, quantityUpdatedOn: todayISO() });
    expect(overview.fixedIncome).toEqual([{ type: 'fixedIncome', amount: 200, updatedOn: todayISO() }]);
    expect(overview.contributions).toHaveLength(1);

    const month = await budget.getMonth(currentMonthKey());
    const investimentos = (await budget.getSettings()).topics.find((topic) => topic.preset === 'investimentos')!;
    expect(month?.expenses).toEqual([
      expect.objectContaining({ topicId: investimentos.id, amount: 350, source: 'investment' }),
    ]);
  });

  it('refuses an aporte of an asset without a quote, changing nothing', async () => {
    const { diagram } = await newAccount();
    const nova = await diagram.addAsset(asset({ ticker: 'NOVA3', quantity: 1 }), todayISO());
    await expect(
      diagram.contribute({
        date: todayISO(),
        month: currentMonthKey(),
        items: [{ assetId: nova.id, type: 'brStocks', quantity: 1 }],
        launchExpense: false,
      }),
    ).rejects.toMatchObject({ code: 'NO_QUOTE' });
    expect((await diagram.getOverview()).assets[0].quantity).toBe(1);
  });

  it('round-trips through the backup and goes away with "Apagar todos os dados"', async () => {
    const { id, diagram } = await newAccount();
    await diagram.saveTargets({ brStocks: 0.7, fixedIncome: 0.3 });
    const wege = await diagram.addAsset(asset({ sector: 'Bens industriais' }), todayISO());
    const roe = await diagram.addQuestion({ type: 'brStocks', criterion: 'ROE', text: 'ROE > 10%?', weight: 2 });
    await diagram.setAnswer(wege.id, roe.id, -1);
    await diagram.setFixedIncome('fixedIncome', 1_000, todayISO());
    const backup = await diagram.exportData();

    await clearAccountData(db, id);
    const empty = await diagram.getOverview();
    expect(empty.assets).toEqual([]);
    expect(empty.settings.targets).toEqual({});

    await diagram.importData(backup);
    expect(await diagram.exportData()).toEqual(backup);
  });
});

describe('parseYahooSearch', () => {
  const payload = {
    quotes: [
      { symbol: 'HGLG11.SA', quoteType: 'EQUITY', exchange: 'SAO', longname: 'Cshg Logistica - Fundo De Investimento Imobiliario' },
      { symbol: 'HGLG11Q.SA', quoteType: 'EQUITY', exchange: 'SAO' },
      { symbol: 'AUVP11.SA', quoteType: 'EQUITY', exchange: 'SAO', longname: 'BTG PACTUAL TEVA AUVP AÇÕES FUNDAMENTOS FUNDO DE ÍNDICE' },
      { symbol: 'VOO', quoteType: 'ETF', exchange: 'PCX', longname: 'Vanguard S&P 500 ETF' },
      { symbol: 'VOO.MX', quoteType: 'ETF', exchange: 'MEX', longname: 'Vanguard S&P 500 ETF' },
      { symbol: 'BTC-USD', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC', shortname: 'Bitcoin USD' },
      { symbol: 'BTC=F', quoteType: 'FUTURE', exchange: 'CME' },
    ],
  };

  it('keeps what each market can price, and spots the ETFs', () => {
    expect(parseYahooSearch('b3', payload)).toEqual([
      { ticker: 'HGLG11', name: 'Cshg Logistica - Fundo De Investimento Imobiliario', isEtf: false },
      { ticker: 'AUVP11', name: 'BTG PACTUAL TEVA AUVP AÇÕES FUNDAMENTOS FUNDO DE ÍNDICE', isEtf: true },
    ]);
    expect(parseYahooSearch('us', payload)).toEqual([{ ticker: 'VOO', name: 'Vanguard S&P 500 ETF', isEtf: true }]);
    expect(parseYahooSearch('crypto', payload)).toEqual([{ ticker: 'BTC', name: 'Bitcoin', isEtf: false }]);
    expect(parseYahooSearch('b3', null)).toEqual([]);
  });
});
