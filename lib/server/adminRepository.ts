import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import type { AdminUser } from '../admin/types';
import { session, user, vipUsers } from './db/schema';
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
  else await db.delete(vipUsers).where(eq(vipUsers.userId, userId));
  return true;
}
