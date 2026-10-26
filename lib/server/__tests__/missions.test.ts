// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Expense } from '../../budget/types';
import { ALL_MODULES } from '../../modules';
import { clearAccountData } from '../accountData';
import { PostgresBudgetRepository } from '../budgetRepository';
import * as schema from '../db/schema';
import type { Database } from '../db/types';
import { PostgresMissionsRepository } from '../missionsRepository';
import { PostgresRemindersRepository } from '../remindersRepository';

/**
 * The XP of the Missões: given by the server, for what the account has or for where the app says
 * it went, once per period by the server's date — never for an amount, never twice.
 */

let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

/** 26/10/2026 at noon in São Paulo. */
const MONDAY = new Date('2026-10-26T15:00:00Z');
const at = (iso: string) => new Date(`${iso}T15:00:00Z`);

async function newAccount() {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Pessoa', email: `${id}@teste.local` });
  return {
    id,
    budget: new PostgresBudgetRepository(db, id),
    missions: new PostgresMissionsRepository(db, id),
  };
}

function expense(amount: number, date: string, overrides: Partial<Expense> = {}): Expense {
  return { id: randomUUID(), categoryKind: 'unforeseen', description: 'x', amount, date, ...overrides };
}

const done = (status: Awaited<ReturnType<PostgresMissionsRepository['check']>>, key: string) =>
  status.missions.find((mission) => mission.key === key)?.done;

describe('Missões', () => {
  it('dá o XP do que a conta fez, uma vez por período, seja qual for o valor', async () => {
    const { budget, missions } = await newAccount();
    const first = await missions.check({ modules: ALL_MODULES, visits: ['open-app'], now: MONDAY });
    expect(first.earned).toEqual([{ key: 'open-app', xp: 10 }]);
    expect(first.xp).toBe(10);

    await budget.ensureMonth('2026-10');
    await budget.saveExpense('2026-10', expense(0.01, '2026-10-26'));
    await budget.saveExpense('2026-10', expense(9999, '2026-10-26'));
    const after = await missions.check({ modules: ALL_MODULES, now: MONDAY });
    expect(after.earned.map((item) => item.key).sort()).toEqual(['first-expense', 'month-expense']);
    expect(after.xp).toBe(10 + 50 + 30);

    // Fifty more expenses give nothing more this month; deleting does not take the XP back.
    for (let i = 0; i < 5; i++) await budget.saveExpense('2026-10', expense(10, '2026-10-26'));
    const again = await missions.check({ modules: ALL_MODULES, visits: ['open-app'], now: MONDAY });
    expect(again.earned).toEqual([]);
    expect(again.xp).toBe(90);
    expect(done(again, 'month-expense')).toBe(true);
  });

  it('recomeça no dia, na semana e no mês seguintes, pela data do servidor', async () => {
    const { budget, missions } = await newAccount();
    await missions.check({ modules: ALL_MODULES, visits: ['open-app'], now: MONDAY });
    const tuesday = await missions.check({ modules: ALL_MODULES, visits: ['open-app'], now: at('2026-10-27') });
    expect(tuesday.earned).toEqual([{ key: 'open-app', xp: 10 }]);

    await budget.ensureMonth('2026-11');
    await budget.saveExpense('2026-11', expense(10, '2026-11-02'));
    const november = await missions.check({ modules: ALL_MODULES, now: at('2026-11-02') });
    expect(november.earned.map((item) => item.key).sort()).toEqual(['first-expense', 'month-expense']);
    // Back in October nothing of November counts.
    const october = await missions.check({ modules: ALL_MODULES, now: at('2026-10-28') });
    expect(done(october, 'month-expense')).toBe(false);
  });

  it('só aceita visita de missão que se faz indo até o lugar, e que a conta tem', async () => {
    const { missions } = await newAccount();
    const status = await missions.check({
      modules: { ...ALL_MODULES, banks: false },
      visits: ['meet-card', 'first-expense', 'meet-banks', 'check-card', 'inventada'],
      now: MONDAY,
    });
    // first-expense is done by data, banks is restricted, check-card needs a card.
    expect(status.earned).toEqual([{ key: 'meet-card', xp: 20 }]);
    expect(status.missions.some((mission) => mission.key === 'meet-banks')).toBe(false);
  });

  it('o lembrete, a renda e as categorias contam pelo que a conta tem', async () => {
    const { id, budget, missions } = await newAccount();
    await budget.getSettings();
    await budget.completeOnboarding();
    await budget.ensureMonth('2026-10');
    await budget.saveIncome('2026-10', { id: randomUUID(), source: 'Salário', amount: 3000, date: '2026-10-05' });
    await new PostgresRemindersRepository(db, id).saveReminder({
      id: 'r1',
      kind: 'daily',
      message: 'Relatório',
      times: ['08:00'],
      repeat: false,
    });
    const status = await missions.check({ modules: ALL_MODULES, now: MONDAY });
    expect(status.earned.map((item) => item.key).sort()).toEqual([
      'first-income',
      'first-reminder',
      'month-income',
      'setup-categories',
    ]);
  });

  it('a conta modelo não ganha nada, e "Apagar todos os dados" zera o XP', async () => {
    const { id, missions } = await newAccount();
    const template = await missions.check({ modules: ALL_MODULES, visits: ['open-app'], now: MONDAY, record: false });
    expect(template.earned).toEqual([]);
    expect(template.xp).toBe(0);

    await missions.check({ modules: ALL_MODULES, visits: ['open-app', 'meet-missions'], now: MONDAY });
    expect((await missions.check({ modules: ALL_MODULES, now: MONDAY })).xp).toBe(30);
    await clearAccountData(db, id);
    expect((await missions.check({ modules: ALL_MODULES, now: MONDAY, record: false })).xp).toBe(0);
  });

  it('mostra o XP de cada mês, do mais novo para o mais velho', async () => {
    const { missions } = await newAccount();
    await missions.check({ modules: ALL_MODULES, visits: ['open-app'], now: MONDAY });
    const status = await missions.check({ modules: ALL_MODULES, now: MONDAY });
    expect(status.months[0].xp).toBeGreaterThanOrEqual(10);
    expect(status.months[0].month).toMatch(/^\d{4}-\d{2}$/);
  });
});
