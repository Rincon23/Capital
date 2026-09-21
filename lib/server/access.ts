import 'server-only';
import { eq } from 'drizzle-orm';
import { vipUsers } from './db/schema';
import type { Database } from './db/types';
import { isOwnerEmail } from './owner';

/** What an account may do beyond the ordinary: run the server (owner) and use the VIP modules. */
export interface UserAccess {
  /** The account whose e-mail is OWNER_EMAIL: sees Administração and is always VIP. */
  owner: boolean;
  /** May turn on the `vipOnly` modules (lib/modules/catalog.ts). */
  vip: boolean;
}

export async function userAccess(db: Database, userId: string, email: string | null): Promise<UserAccess> {
  if (isOwnerEmail(email)) return { owner: true, vip: true };
  const [row] = await db
    .select({ userId: vipUsers.userId })
    .from(vipUsers)
    .where(eq(vipUsers.userId, userId));
  return { owner: false, vip: row !== undefined };
}
