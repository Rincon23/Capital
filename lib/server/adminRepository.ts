import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AdminModule, AdminUser } from '../admin/types';
import type { ModuleKey } from '../budget/types';
import { dependentsOf, MODULE_KEYS, resolveModules } from '../modules';
import { vipModules } from './access';
import { budgetSettings, moduleAccess, session, user, vipUsers } from './db/schema';
import type { Database } from './db/types';
import { isOwnerEmail } from './owner';

/** Every account on the server, newest first, for Administração (owner only). */
export async function listUsers(db: Database): Promise<AdminUser[]> {
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      emailVerified: user.emailVerified,
      vip: sql<boolean>`${vipUsers.userId} is not null`,
      lastSeenAt: sql<
        string | null
      >`(select max(${session.updatedAt}) from ${session} where ${session.userId} = ${user.id})`,
    })
    .from(user)
    .leftJoin(vipUsers, eq(vipUsers.userId, user.id))
    .orderBy(desc(user.createdAt))
    .limit(2000);

  return rows.map((row) => {
    const owner = isOwnerEmail(row.email);
    return {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
      emailVerified: row.emailVerified,
      vip: owner || row.vip,
      owner,
      lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    };
  });
}

/** Makes an account VIP or takes it back. False when there is no such account. */
export async function setVip(db: Database, userId: string, vip: boolean): Promise<boolean> {
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
  if (!target) return false;
  if (vip) await db.insert(vipUsers).values({ userId }).onConflictDoNothing();
  else {
    await db.delete(vipUsers).where(eq(vipUsers.userId, userId));
    // Without VIP, the VIP-only modules go off for the account (its data stays): nothing of theirs
    // runs in the background anymore, and turning them back on is the person's choice once VIP again.
    await turnOffForAccountsWithoutVip(db, await vipModules(db), userId);
  }
  return true;
}

/** Every module, in catalog order, with the owner's "Só VIP" choice and who would lose it. */
export async function listModules(db: Database): Promise<AdminModule[]> {
  const [vipOnly, accounts] = await Promise.all([vipModules(db), accountsWithoutVip(db)]);
  const resolved = accounts.map((account) => resolveModules(account.modules));
  return MODULE_KEYS.map((key) => ({
    key,
    vipOnly: vipOnly.includes(key),
    usersWithoutVip: resolved.filter((modules) => modules[key]).length,
  }));
}

/**
 * Makes a module only for VIP accounts ("Só VIP") or opens it to everyone. Becoming VIP-only, it
 * goes off for every account that is not VIP, together with the modules that depend on it; opened,
 * nothing changes until each person turns it on. Returns how many accounts had it turned off.
 */
export async function setModuleVip(db: Database, key: ModuleKey, vipOnly: boolean): Promise<number> {
  await db
    .insert(moduleAccess)
    .values({ moduleKey: key, vipOnly })
    .onConflictDoUpdate({ target: moduleAccess.moduleKey, set: { vipOnly, updatedAt: new Date() } });
  return vipOnly ? turnOffForAccountsWithoutVip(db, [key]) : 0;
}

/** The module switches of every account that is not VIP (the owner always is). */
async function accountsWithoutVip(db: Database, userId?: string) {
  const rows = await db
    .select({ userId: budgetSettings.userId, modules: budgetSettings.modules, email: user.email })
    .from(budgetSettings)
    .innerJoin(user, eq(user.id, budgetSettings.userId))
    .leftJoin(vipUsers, eq(vipUsers.userId, budgetSettings.userId))
    .where(and(isNull(vipUsers.userId), userId ? eq(budgetSettings.userId, userId) : undefined));
  return rows.filter((row) => !isOwnerEmail(row.email));
}

/**
 * Turns `keys` off, with every module that depends on them, for the accounts without VIP (or just
 * `userId`). Only the switches change: entries, cards, banks and keys all stay, waiting for the
 * module to come back. Returns how many accounts had one of them on.
 */
async function turnOffForAccountsWithoutVip(db: Database, keys: ModuleKey[], userId?: string): Promise<number> {
  const off = [...new Set(keys.flatMap((key) => [key, ...dependentsOf(key)]))];
  let turnedOff = 0;
  for (const account of await accountsWithoutVip(db, userId)) {
    if (!off.some((key) => account.modules[key])) continue;
    const wasOn = off.some((key) => resolveModules(account.modules)[key]);
    await db.transaction(async (tx) => {
      // The same lock every budget write takes, and the switches as they are under it.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${account.userId}, 0))`);
      const [current] = await tx
        .select({ modules: budgetSettings.modules })
        .from(budgetSettings)
        .where(eq(budgetSettings.userId, account.userId));
      if (!current) return;
      const modules = { ...current.modules };
      for (const key of off) if (modules[key]) modules[key] = false;
      await tx.update(budgetSettings).set({ modules }).where(eq(budgetSettings.userId, account.userId));
    });
    if (wasOn) turnedOff += 1;
  }
  return turnedOff;
}
