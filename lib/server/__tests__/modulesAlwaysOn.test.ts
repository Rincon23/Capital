// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeWidgetKey, ModuleFlags } from '../../budget/types';
import { ALL_MODULES, HOME_WIDGET_KEYS, resolveHomePages, resolveModules } from '../../modules';
import { syncModules } from '../adminRepository';
import { PostgresBudgetRepository } from '../budgetRepository';
import * as schema from '../db/schema';
import type { Database } from '../db/types';
import { homeTemplate } from '../homeTemplate';
import { runModulesAlwaysOnMigration } from '../modulesAlwaysOnMigration';

/**
 * Modules stopped being switchable: on the first start every account's Início is saved as it shows
 * (the widgets of modules that were off must not flood it), then everyone but the owner gets the
 * template's Início, once.
 */

let db: Database;

const OWNER = 'dono@capital.test';
const TEMPLATE = 'modelo@capital.local';

beforeEach(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
  vi.stubEnv('OWNER_EMAIL', OWNER);
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

async function person(
  email: string,
  settings: {
    modules?: Partial<ModuleFlags>;
    homePages?: HomeWidgetKey[][] | null;
    homeHidden?: HomeWidgetKey[];
    homeCardSizes?: Partial<Record<HomeWidgetKey, 'half' | 'full'>>;
  } = {},
) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Pessoa', email });
  await db.insert(schema.budgetSettings).values({
    userId: id,
    topics: [],
    specialCategories: { fixedCost: 'Custos Fixos', unforeseen: 'Imprevistos' },
    modules: settings.modules ?? {},
    homePages: settings.homePages ?? null,
    homeHidden: settings.homeHidden ?? [],
    homeCardSizes: settings.homeCardSizes ?? {},
  });
  return id;
}

async function settingsOf(userId: string) {
  return new PostgresBudgetRepository(db, userId).getSettings();
}

describe('todos os módulos ligados', () => {
  it('guarda a Início do dono como estava e dá a mesma para todo mundo, uma vez só', async () => {
    const owner = await person(OWNER, {
      modules: { expenses: true, budget: true, card: true, reminders: true },
      homePages: [['budget', 'expenses'], ['card']],
      homeHidden: ['calendar'],
      homeCardSizes: { budget: 'full' },
    });
    const common = await person('alguem@teste.local', {
      modules: { expenses: true, diagram: true },
      homePages: [['diagram', 'expenses']],
    });

    expect(await runModulesAlwaysOnMigration(db)).toEqual({ frozen: 2, reset: 1 });

    // The owner's Início shows exactly what it showed; everything else waits in the tray.
    const mine = await settingsOf(owner);
    expect(mine.homePages).toEqual([['budget', 'expenses'], ['card', 'reminders']]);
    expect(mine.homeHidden).toEqual(HOME_WIDGET_KEYS.filter((key) => !['budget', 'expenses', 'card', 'reminders'].includes(key)));

    await syncModules(db);
    expect(resolveModules(await settingsOf(owner))).toEqual(ALL_MODULES);
    expect(resolveHomePages(await settingsOf(owner))).toEqual([['budget', 'expenses'], ['card', 'reminders']]);

    // Everyone else now has the owner's Início, sizes included, and all the modules.
    const theirs = await settingsOf(common);
    expect(theirs.homePages).toEqual(mine.homePages);
    expect(theirs.homeHidden).toEqual(mine.homeHidden);
    expect(theirs.homeCardSizes).toEqual({ budget: 'full' });
    expect(resolveHomePages(theirs)).toEqual([['budget', 'expenses'], ['card', 'reminders']]);
    expect(resolveModules(theirs)).toEqual({ ...ALL_MODULES, banks: false, voice: false });

    // Once: what each one changes afterwards stays.
    await db
      .update(schema.budgetSettings)
      .set({ homePages: [['expenses']] })
      .where(eq(schema.budgetSettings.userId, common));
    expect(await runModulesAlwaysOnMigration(db)).toEqual({ frozen: 0, reset: 0 });
    expect((await settingsOf(common)).homePages).toEqual([['expenses']]);
  });

  it('com a conta modelo, é a Início dela que vale, e é dela que a conta nova parte', async () => {
    vi.stubEnv('HOME_TEMPLATE_EMAIL', TEMPLATE);
    await person(OWNER, { modules: { expenses: true }, homePages: [['expenses']] });
    const template = await person(TEMPLATE, { homePages: [['reminders'], ['expenses', 'cash']], homeHidden: ['gmail'] });
    const common = await person('alguem@teste.local', { modules: { expenses: true } });

    expect(await runModulesAlwaysOnMigration(db)).toEqual({ frozen: 3, reset: 1 });
    const expected = (await settingsOf(template)).homePages;
    expect((await settingsOf(common)).homePages).toEqual(expected);
    expect((await homeTemplate(db))?.homePages).toEqual(expected);

    // A brand-new account starts from the template too, with "Primeiros passos".
    const id = randomUUID();
    await db.insert(schema.user).values({ id, name: 'Nova', email: 'nova@teste.local' });
    const fresh = await settingsOf(id);
    expect(fresh.homePages).toEqual(expected);
    expect(fresh.dismissedNotices).toEqual(['first-steps']);
    expect(resolveModules(fresh)).toEqual(ALL_MODULES);
  });

  it('sem dono nem modelo, só guarda cada Início como estava e espera', async () => {
    vi.stubEnv('OWNER_EMAIL', '');
    await person('alguem@teste.local', { modules: { expenses: true } });
    expect(await runModulesAlwaysOnMigration(db)).toEqual({ frozen: 1, reset: 0 });
  });
});
