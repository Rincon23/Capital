import 'server-only';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import type { BankAccountKind, BankConnection, BankConnectionStatus } from '@/lib/banks';
import { bankAccounts, bankConnections, bankKeys } from '../db/schema';
import type { Database } from '../db/types';
import { HttpError } from '../httpError';
import { decryptSecret, encryptSecret } from '../secretBox';

export interface StoredAccount {
  accountId: string;
  kind: BankAccountKind;
  name: string;
  balance: number | null;
  currency: string | null;
}

/** What the last read of an item said about it. */
export interface ConnectionUpdate {
  status: BankConnectionStatus;
  lastUpdatedAt?: Date | null;
  nextAutoSyncAt?: Date | null;
  consentExpiresAt?: Date | null;
  suggestedName?: string;
}

export interface PendingConnection {
  itemId: string;
  authorizeExpiresAt: Date | null;
  createdAt: Date;
}

/** One person's Open Finance: their Pluggy key and the banks (items) they brought. */
export class PostgresBanksRepository {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  /** What the screen may see of the key: never the Secret. */
  async getKey(): Promise<{ clientId: string; secretHint: string } | null> {
    const [row] = await this.db
      .select({ clientId: bankKeys.clientId, secretHint: bankKeys.secretHint })
      .from(bankKeys)
      .where(eq(bankKeys.userId, this.userId));
    return row ?? null;
  }

  /** The key, decrypted, for the server's own calls to Pluggy. */
  async getCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
    const [row] = await this.db.select().from(bankKeys).where(eq(bankKeys.userId, this.userId));
    if (!row) return null;
    return { clientId: row.clientId, clientSecret: decryptSecret(row.clientSecret) };
  }

  async saveKey(clientId: string, clientSecret: string): Promise<void> {
    const values = {
      clientId,
      clientSecret: encryptSecret(clientSecret),
      secretHint: clientSecret.slice(-4),
    };
    await this.db
      .insert(bankKeys)
      .values({ userId: this.userId, ...values })
      .onConflictDoUpdate({ target: bankKeys.userId, set: values });
  }

  /** "Desconectar": the key and every bank (their accounts go with them). */
  async deleteAll(): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(bankConnections).where(eq(bankConnections.userId, this.userId));
      await tx.delete(bankKeys).where(eq(bankKeys.userId, this.userId));
    });
  }

  async listConnections(): Promise<BankConnection[]> {
    const rows = await this.db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.userId, this.userId))
      .orderBy(asc(bankConnections.createdAt));
    const accounts = await this.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, this.userId))
      .orderBy(asc(bankAccounts.createdAt), asc(bankAccounts.name));
    return rows.map((row) => ({
      itemId: row.itemId,
      name: row.name ?? row.suggestedName ?? (row.status === 'pending' ? 'Banco chegando' : 'Banco'),
      named: row.name !== null,
      status: row.status,
      lastUpdatedAt: row.lastUpdatedAt?.toISOString() ?? null,
      nextAutoSyncAt: row.nextAutoSyncAt?.toISOString() ?? null,
      consentExpiresAt: row.consentExpiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      accounts: accounts
        .filter((account) => account.itemId === row.itemId)
        .map((account) => ({ id: account.accountId, kind: account.kind, name: account.name })),
    }));
  }

  async itemIds(): Promise<string[]> {
    const rows = await this.db
      .select({ itemId: bankConnections.itemId })
      .from(bankConnections)
      .where(eq(bankConnections.userId, this.userId));
    return rows.map((row) => row.itemId);
  }

  /** The banks still on their way, and the ones whose last update failed (Pluggy may recover). */
  async pendingConnections(): Promise<PendingConnection[]> {
    return this.db
      .select({
        itemId: bankConnections.itemId,
        authorizeExpiresAt: bankConnections.authorizeExpiresAt,
        createdAt: bankConnections.createdAt,
      })
      .from(bankConnections)
      .where(
        and(eq(bankConnections.userId, this.userId), inArray(bankConnections.status, ['pending', 'error'])),
      );
  }

  async addPending(itemId: string, authorizeExpiresAt: Date | null): Promise<void> {
    await this.db
      .insert(bankConnections)
      .values({ userId: this.userId, itemId, status: 'pending', authorizeExpiresAt })
      .onConflictDoNothing();
  }

  async setAuthorizeExpiry(itemId: string, authorizeExpiresAt: Date | null): Promise<void> {
    await this.db
      .update(bankConnections)
      .set({ authorizeExpiresAt })
      .where(and(eq(bankConnections.userId, this.userId), eq(bankConnections.itemId, itemId)));
  }

  async updateConnection(itemId: string, update: ConnectionUpdate): Promise<void> {
    await this.db
      .update(bankConnections)
      .set({
        status: update.status,
        ...(update.lastUpdatedAt !== undefined ? { lastUpdatedAt: update.lastUpdatedAt } : {}),
        ...(update.nextAutoSyncAt !== undefined ? { nextAutoSyncAt: update.nextAutoSyncAt } : {}),
        ...(update.consentExpiresAt !== undefined ? { consentExpiresAt: update.consentExpiresAt } : {}),
        ...(update.suggestedName !== undefined ? { suggestedName: update.suggestedName } : {}),
        ...(update.status !== 'pending' ? { authorizeExpiresAt: null } : {}),
      })
      .where(and(eq(bankConnections.userId, this.userId), eq(bankConnections.itemId, itemId)));
  }

  /** The accounts as the last read brought them: new ones added, the rest updated, gone ones removed. */
  async replaceAccounts(itemId: string, accounts: StoredAccount[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const ids = accounts.map((account) => account.accountId);
      await tx
        .delete(bankAccounts)
        .where(
          and(
            eq(bankAccounts.userId, this.userId),
            eq(bankAccounts.itemId, itemId),
            ...(ids.length > 0 ? [notInArray(bankAccounts.accountId, ids)] : []),
          ),
        );
      for (const account of accounts) {
        const values = {
          itemId,
          kind: account.kind,
          name: account.name,
          balance: account.balance,
          currency: account.currency,
        };
        await tx
          .insert(bankAccounts)
          .values({ userId: this.userId, accountId: account.accountId, ...values })
          .onConflictDoUpdate({ target: [bankAccounts.userId, bankAccounts.accountId], set: values });
      }
    });
  }

  /** The person's own name for a bank; null goes back to the suggestion. */
  async rename(itemId: string, name: string | null): Promise<void> {
    const updated = await this.db
      .update(bankConnections)
      .set({ name })
      .where(and(eq(bankConnections.userId, this.userId), eq(bankConnections.itemId, itemId)))
      .returning({ itemId: bankConnections.itemId });
    if (updated.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Este banco não está mais no Capital.');
  }

  async deleteConnections(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    await this.db
      .delete(bankConnections)
      .where(and(eq(bankConnections.userId, this.userId), inArray(bankConnections.itemId, itemIds)));
  }

  async hasConnection(itemId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ itemId: bankConnections.itemId })
      .from(bankConnections)
      .where(and(eq(bankConnections.userId, this.userId), eq(bankConnections.itemId, itemId)));
    return row !== undefined;
  }
}
