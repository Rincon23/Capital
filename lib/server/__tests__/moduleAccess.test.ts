// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleFlags } from '../../budget/types';
import { requireNotVipLocked, userAccess, vipModules } from '../access';
import { listModules, setModuleVip, setVip } from '../adminRepository';
import * as schema from '../db/schema';
import type { Database } from '../db/types';
import { HttpError } from '../httpError';

/**
 * "Só VIP" in Administração: the owner picks which modules are only for VIP accounts. Becoming VIP
 * only, a module goes off for everyone else (their data stays); opened again, they may turn it on.
 */

let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

const OWNER = 'dono@capital.test';

beforeEach(async () => {
  vi.stubEnv('OWNER_EMAIL', OWNER);
  await db.delete(schema.moduleAccess);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function newPerson(modules: Partial<ModuleFlags>, { vip = false, email }: { vip?: boolean; email?: string } = {}) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Pessoa', email: email ?? `${id}@teste.local` });
  await db.insert(schema.budgetSettings).values({
    userId: id,
    topics: [],
    specialCategories: { fixedCost: 'Custo Fixo', unforeseen: 'Imprevistos' },
    modules,
  });
  if (vip) await db.insert(schema.vipUsers).values({ userId: id });
  return id;
}

async function modulesOf(userId: string) {
  const [row] = await db
    .select({ modules: schema.budgetSettings.modules })
    .from(schema.budgetSettings)
    .where(eq(schema.budgetSettings.userId, userId));
  return row.modules;
}

describe('módulos só para VIP', () => {
  it('começa como hoje: Open Finance e Lançar por voz ou texto', async () => {
    expect(await vipModules(db)).toEqual(['banks', 'voice']);
    const id = await newPerson({});
    expect(await userAccess(db, id, `${id}@teste.local`)).toEqual({
      owner: false,
      vip: false,
      vipModules: ['banks', 'voice'],
    });
  });

  it('ao virar "Só VIP", desliga para quem não é VIP (e o que depende dele), sem apagar nada', async () => {
    const common = await newPerson({ expenses: true, budget: true, history: true, gmail: true });
    const vip = await newPerson({ expenses: true, budget: true }, { vip: true });
    const owner = await newPerson({ expenses: true, budget: true }, { email: OWNER });
    await db.insert(schema.gmailKeywords).values({ userId: common, keyword: 'fatura' });

    expect(await setModuleVip(db, 'budget', true)).toBe(1);
    expect(await vipModules(db)).toEqual(['budget', 'banks', 'voice']);
    expect(await modulesOf(common)).toEqual({ expenses: true, budget: false, history: false, gmail: true });
    expect(await modulesOf(vip)).toEqual({ expenses: true, budget: true });
    expect(await modulesOf(owner)).toEqual({ expenses: true, budget: true });

    // Nothing of theirs goes away with the switch.
    const keywords = await db
      .select()
      .from(schema.gmailKeywords)
      .where(eq(schema.gmailKeywords.userId, common));
    expect(keywords).toHaveLength(1);

    // And the server refuses it to them from then on, as an address that does not exist.
    expect(() => requireNotVipLocked({ vip: false, vipModules: ['budget'] }, 'budget')).toThrow(HttpError);
    expect(() => requireNotVipLocked({ vip: false, vipModules: ['budget'] }, 'budget')).toThrow('Não encontrado.');
    expect(() => requireNotVipLocked({ vip: true, vipModules: ['budget'] }, 'budget')).not.toThrow();
  });

  it('ao deixar de ser VIP, só libera: quem não é VIP liga quando quiser', async () => {
    const common = await newPerson({ expenses: true });
    expect(await setModuleVip(db, 'banks', false)).toBe(0);
    expect(await vipModules(db)).toEqual(['voice']);
    expect(await modulesOf(common)).toEqual({ expenses: true });
    expect((await userAccess(db, common, `${common}@teste.local`)).vipModules).toEqual(['voice']);

    // Back to VIP only: off again for whoever turned it on meanwhile.
    await db
      .update(schema.budgetSettings)
      .set({ modules: { expenses: true, banks: true } })
      .where(eq(schema.budgetSettings.userId, common));
    expect(await setModuleVip(db, 'banks', true)).toBe(1);
    expect(await modulesOf(common)).toEqual({ expenses: true, banks: false });
  });

  it('mostra na Administração cada módulo, a escolha e quem sem VIP usa agora', async () => {
    await newPerson({ expenses: true, gmail: true });
    await newPerson({ gmail: true }, { vip: true });
    await setModuleVip(db, 'voice', false);

    const modules = await listModules(db);
    expect(modules.map((item) => item.key)).toHaveLength(12);
    const gmail = modules.find((item) => item.key === 'gmail');
    expect(gmail).toEqual({ key: 'gmail', vipOnly: false, usersWithoutVip: expect.any(Number) });
    expect(gmail!.usersWithoutVip).toBeGreaterThanOrEqual(1);
    expect(modules.filter((item) => item.vipOnly).map((item) => item.key)).toEqual(['banks']);
  });

  it('quem perde o VIP fica com os módulos só VIP desligados, e os dados ficam', async () => {
    await setModuleVip(db, 'gmail', true);
    const id = await newPerson({ expenses: true, gmail: true, voice: true }, { vip: true });
    await setVip(db, id, false);
    expect(await modulesOf(id)).toEqual({ expenses: true, gmail: false, voice: false });
    expect((await userAccess(db, id, `${id}@teste.local`)).vip).toBe(false);
  });
});
