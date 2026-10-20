import 'server-only';
import { and, asc, desc, eq, gte, inArray, ne, notInArray, sql } from 'drizzle-orm';
import {
  DEFAULT_BANK_ALERTS,
  investmentLabel,
  isUsualReserve,
  type BankAccountKind,
  type BankConnection,
  type BankConnectionStatus,
  type AlertTransaction,
  type BankAlertSettings,
  type BankReserve,
  type ReserveSource,
  type SalaryCandidate,
  type SalaryRef,
} from '@/lib/banks';
import { round2 } from '@/lib/budget/money';
import {
  bankAccounts,
  bankConnections,
  bankInvestments,
  bankKeys,
  bankSettings,
  bankTransactions,
  cashSettings,
} from '../db/schema';
import type { Database } from '../db/types';
import { HttpError } from '../httpError';
import { decryptSecret, encryptSecret } from '../secretBox';

export interface StoredAccount {
  accountId: string;
  kind: BankAccountKind;
  name: string;
  balance: number | null;
  currency: string | null;
  balanceAt?: Date | null;
  creditLimit?: number | null;
  availableCredit?: number | null;
  dueDate?: string | null;
}

export interface StoredInvestment {
  investmentId: string;
  name: string;
  type: string | null;
  subtype: string | null;
  balance: number | null;
  balanceAt: Date | null;
}

/** A transaction as the Capital keeps it (`bank_transactions`), without what it became. */
export type StoredTransaction = Omit<
  typeof bankTransactions.$inferInsert,
  'userId' | 'outcome' | 'entryId' | 'createdAt' | 'updatedAt'
>;

/** What the last read of an item said about it. */
export interface ConnectionUpdate {
  status: BankConnectionStatus;
  lastUpdatedAt?: Date | null;
  nextAutoSyncAt?: Date | null;
  consentExpiresAt?: Date | null;
  suggestedName?: string;
  checkedAt?: Date;
  /** The `lastUpdatedAt` whose data was just read in full. */
  syncedUpdateAt?: Date | null;
}

/** A bank the sync looks at: what Pluggy last said and how far the Capital already read. */
export interface SyncedConnection {
  itemId: string;
  status: BankConnectionStatus;
  lastUpdatedAt: Date | null;
  syncedUpdateAt: Date | null;
}

export interface PendingConnection {
  itemId: string;
  authorizeExpiresAt: Date | null;
  createdAt: Date;
}

/** What a later read may change in a known transaction (never what the person decided about it). */
const TRANSACTION_FIELDS = [
  'accountId',
  'date',
  'amount',
  'currency',
  'description',
  'descriptionRaw',
  'type',
  'status',
  'category',
  'operationType',
  'paymentMethod',
  'payerName',
  'payerDocument',
  'receiverName',
  'receiverDocument',
  'merchantName',
  'installmentNumber',
  'totalInstallments',
  'purchaseDate',
  'billId',
] as const;

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
        .map((account) => ({
          id: account.accountId,
          kind: account.kind,
          name: account.name,
          balance: account.balance,
          balanceAt: account.balanceAt?.toISOString() ?? null,
          creditLimit: account.creditLimit,
          availableCredit: account.availableCredit,
          dueDate: account.dueDate,
        })),
    }));
  }

  /** Every bank past its arrival, for the sync. */
  async connectionsToSync(): Promise<SyncedConnection[]> {
    return this.db
      .select({
        itemId: bankConnections.itemId,
        status: bankConnections.status,
        lastUpdatedAt: bankConnections.lastUpdatedAt,
        syncedUpdateAt: bankConnections.syncedUpdateAt,
      })
      .from(bankConnections)
      .where(and(eq(bankConnections.userId, this.userId), ne(bankConnections.status, 'pending')))
      .orderBy(asc(bankConnections.createdAt));
  }

  /**
   * Keeps what a read brought, by Pluggy's id: new transactions are added, known ones updated
   * (pending → posted), and what the person decided about them is never touched. Answers the ids
   * that were new.
   */
  async upsertTransactions(transactions: StoredTransaction[]): Promise<string[]> {
    const added: string[] = [];
    for (let start = 0; start < transactions.length; start += 200) {
      const chunk = transactions.slice(start, start + 200).map((row) => ({ ...row, userId: this.userId }));
      const rows = await this.db
        .insert(bankTransactions)
        .values(chunk)
        .onConflictDoUpdate({
          target: [bankTransactions.userId, bankTransactions.transactionId],
          set: {
            ...Object.fromEntries(
              TRANSACTION_FIELDS.map((field) => [field, sql.raw(`excluded."${bankTransactions[field].name}"`)]),
            ),
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: bankTransactions.transactionId, added: sql<boolean>`(xmax = 0)` });
      for (const row of rows) if (row.added) added.push(row.id);
    }
    return added;
  }

  /** The investments as the last read brought them (an empty read changes nothing, as with accounts). */
  async replaceInvestments(itemId: string, investments: StoredInvestment[]): Promise<void> {
    if (investments.length === 0) return;
    await this.db.transaction(async (tx) => {
      await tx.delete(bankInvestments).where(
        and(
          eq(bankInvestments.userId, this.userId),
          eq(bankInvestments.itemId, itemId),
          notInArray(
            bankInvestments.investmentId,
            investments.map((investment) => investment.investmentId),
          ),
        ),
      );
      for (const investment of investments) {
        const values = {
          itemId,
          name: investment.name,
          type: investment.type,
          subtype: investment.subtype,
          balance: investment.balance,
          balanceAt: investment.balanceAt,
        };
        await tx
          .insert(bankInvestments)
          .values({ userId: this.userId, investmentId: investment.investmentId, ...values })
          .onConflictDoUpdate({ target: [bankInvestments.userId, bankInvestments.investmentId], set: values });
      }
    });
  }

  /** What can feed the Reserva, bank by bank, and the sum of what the person marked. */
  async reserve(): Promise<BankReserve> {
    const connections = await this.db
      .select()
      .from(bankConnections)
      .where(and(eq(bankConnections.userId, this.userId), ne(bankConnections.status, 'pending')))
      .orderBy(asc(bankConnections.createdAt));
    const accounts = await this.db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.userId, this.userId), ne(bankAccounts.kind, 'card')))
      .orderBy(asc(bankAccounts.name));
    const investments = await this.db
      .select()
      .from(bankInvestments)
      .where(eq(bankInvestments.userId, this.userId))
      .orderBy(asc(bankInvestments.name));

    let total: number | null = null;
    const add = (marked: boolean, balance: number | null) => {
      if (marked) total = round2((total ?? 0) + (balance ?? 0));
    };
    const banks = connections.map((connection) => {
      const sources: ReserveSource[] = [
        ...accounts
          .filter((account) => account.itemId === connection.itemId)
          .map((account) => {
            add(account.feedsReserve, account.balance);
            return {
              id: account.accountId,
              kind: 'account' as const,
              name: account.name,
              detail: account.kind === 'savings' ? 'poupança' : 'conta',
              usual: true,
              balance: account.balance,
              marked: account.feedsReserve,
            };
          }),
        ...investments
          .filter((investment) => investment.itemId === connection.itemId)
          .map((investment) => {
            add(investment.feedsReserve, investment.balance);
            return {
              id: investment.investmentId,
              kind: 'investment' as const,
              name: investment.name,
              detail: investmentLabel(investment.type, investment.subtype),
              usual: isUsualReserve(investment.type),
              balance: investment.balance,
              marked: investment.feedsReserve,
            };
          }),
      ];
      return {
        itemId: connection.itemId,
        name: connection.name ?? connection.suggestedName ?? 'Banco',
        status: connection.status,
        lastUpdatedAt: connection.lastUpdatedAt?.toISOString() ?? null,
        sources,
      };
    });
    return { banks: banks.filter((bank) => bank.sources.length > 0), total };
  }

  /** Marks exactly these accounts and investments as the reserve (none: back to typing it). */
  async setReserveSources(accountIds: string[], investmentIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(bankAccounts)
        .set({ feedsReserve: accountIds.length ? inArray(bankAccounts.accountId, accountIds) : sql`false` })
        .where(eq(bankAccounts.userId, this.userId));
      await tx
        .update(bankInvestments)
        .set({
          feedsReserve: investmentIds.length ? inArray(bankInvestments.investmentId, investmentIds) : sql`false`,
        })
        .where(eq(bankInvestments.userId, this.userId));
    });
  }

  /**
   * Writes the sum of the marked balances as the Reserva's "Reserva em conta". Nothing marked:
   * nothing is written (the person types it). Answers what was written.
   */
  async writeReserve(): Promise<number | null> {
    const { total } = await this.reserve();
    if (total === null) return null;
    await this.db
      .insert(cashSettings)
      .values({ userId: this.userId, reserveAccountAmount: total })
      .onConflictDoUpdate({ target: cashSettings.userId, set: { reserveAccountAmount: total } });
    return total;
  }

  /** What to alert about (the defaults until the person changes anything). */
  async alertSettings(): Promise<BankAlertSettings> {
    const [row] = await this.db
      .select({ alerts: bankSettings.alerts })
      .from(bankSettings)
      .where(eq(bankSettings.userId, this.userId));
    return { ...DEFAULT_BANK_ALERTS, ...(row?.alerts ?? {}) };
  }

  async saveAlertSettings(alerts: BankAlertSettings): Promise<void> {
    await this.db
      .insert(bankSettings)
      .values({ userId: this.userId, alerts })
      .onConflictDoUpdate({ target: bankSettings.userId, set: { alerts } });
  }

  /** These transactions as the alerts read them, only the ones dated `since` or later. */
  async alertTransactions(ids: string[], since: string): Promise<AlertTransaction[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        id: bankTransactions.transactionId,
        accountKind: bankAccounts.kind,
        amount: bankTransactions.amount,
        type: bankTransactions.type,
        description: bankTransactions.description,
        paymentMethod: bankTransactions.paymentMethod,
        operationType: bankTransactions.operationType,
        category: bankTransactions.category,
        payerName: bankTransactions.payerName,
        payerDocument: bankTransactions.payerDocument,
      })
      .from(bankTransactions)
      .innerJoin(
        bankAccounts,
        and(eq(bankAccounts.userId, bankTransactions.userId), eq(bankAccounts.accountId, bankTransactions.accountId)),
      )
      .where(
        and(
          eq(bankTransactions.userId, this.userId),
          inArray(bankTransactions.transactionId, ids),
          gte(bankTransactions.date, since),
        ),
      );
    return rows;
  }

  /**
   * Recent credits that could be a salary (accounts only, from R$ 300, not moved between the
   * person's own accounts): the latest of each payer, the ones the bank called a salary first.
   */
  async salaryCandidates(since: string): Promise<SalaryCandidate[]> {
    const rows = await this.db
      .select({
        transactionId: bankTransactions.transactionId,
        date: bankTransactions.date,
        amount: bankTransactions.amount,
        description: bankTransactions.description,
        payerName: bankTransactions.payerName,
        payerDocument: bankTransactions.payerDocument,
        operationType: bankTransactions.operationType,
        category: bankTransactions.category,
        bankName: sql<string>`coalesce(${bankConnections.name}, ${bankConnections.suggestedName}, 'Banco')`,
      })
      .from(bankTransactions)
      .innerJoin(
        bankAccounts,
        and(eq(bankAccounts.userId, bankTransactions.userId), eq(bankAccounts.accountId, bankTransactions.accountId)),
      )
      .innerJoin(
        bankConnections,
        and(eq(bankConnections.userId, bankAccounts.userId), eq(bankConnections.itemId, bankAccounts.itemId)),
      )
      .where(
        and(
          eq(bankTransactions.userId, this.userId),
          eq(bankTransactions.type, 'CREDIT'),
          ne(bankAccounts.kind, 'card'),
          gte(bankTransactions.date, since),
          gte(bankTransactions.amount, 300),
        ),
      )
      .orderBy(desc(bankTransactions.date));
    const seen = new Set<string>();
    const candidates: SalaryCandidate[] = [];
    for (const row of rows) {
      if (row.category === 'Same person transfer' || row.category === 'Investments') continue;
      if (row.operationType && /APLIC|RESGATE|RENDIMENTO/.test(row.operationType)) continue;
      const payer = row.payerDocument ?? row.payerName ?? row.description;
      if (seen.has(payer)) continue;
      seen.add(payer);
      candidates.push({
        transactionId: row.transactionId,
        date: row.date,
        amount: row.amount,
        description: row.description,
        payerName: row.payerName,
        payerDocument: row.payerDocument,
        bankName: row.bankName,
        likely: row.operationType === 'PORTABILIDADE_SALARIO',
      });
    }
    return candidates
      .sort((a, b) => Number(b.likely) - Number(a.likely) || b.amount - a.amount)
      .slice(0, 8);
  }

  /**
   * The salaries the person pointed at, built from the transactions themselves (payer, amount,
   * description). One that is no longer stored (its bank left) keeps what was saved before.
   */
  async salaryRefs(transactionIds: string[], previous: SalaryRef[]): Promise<SalaryRef[]> {
    if (transactionIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(bankTransactions)
      .where(and(eq(bankTransactions.userId, this.userId), inArray(bankTransactions.transactionId, transactionIds)));
    return transactionIds.flatMap((id): SalaryRef[] => {
      const row = rows.find((candidate) => candidate.transactionId === id);
      if (row) {
        return [
          {
            transactionId: id,
            payerDocument: row.payerDocument,
            payerName: row.payerName,
            description: row.description,
            amount: row.amount,
          },
        ];
      }
      return previous.filter((ref) => ref.transactionId === id);
    });
  }

  /** The name each bank shows (the person's, or the suggested one). */
  async connectionNames(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ itemId: bankConnections.itemId, name: bankConnections.name, suggested: bankConnections.suggestedName })
      .from(bankConnections)
      .where(eq(bankConnections.userId, this.userId));
    return new Map(rows.map((row) => [row.itemId, row.name ?? row.suggested ?? 'Banco']));
  }

  async countTransactions(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bankTransactions)
      .where(eq(bankTransactions.userId, this.userId));
    return row?.count ?? 0;
  }

  async itemIds(): Promise<string[]> {
    const rows = await this.db
      .select({ itemId: bankConnections.itemId })
      .from(bankConnections)
      .where(eq(bankConnections.userId, this.userId));
    return rows.map((row) => row.itemId);
  }

  /** The banks still on their way (the ones that failed are the sync's, which reads them again). */
  async pendingConnections(): Promise<PendingConnection[]> {
    return this.db
      .select({
        itemId: bankConnections.itemId,
        authorizeExpiresAt: bankConnections.authorizeExpiresAt,
        createdAt: bankConnections.createdAt,
      })
      .from(bankConnections)
      .where(and(eq(bankConnections.userId, this.userId), eq(bankConnections.status, 'pending')));
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
        ...(update.checkedAt !== undefined ? { checkedAt: update.checkedAt } : {}),
        ...(update.syncedUpdateAt !== undefined ? { syncedUpdateAt: update.syncedUpdateAt } : {}),
        ...(update.status !== 'pending' ? { authorizeExpiresAt: null } : {}),
      })
      .where(and(eq(bankConnections.userId, this.userId), eq(bankConnections.itemId, itemId)));
  }

  /**
   * The accounts as the last read brought them: new ones added, the rest updated, gone ones removed
   * (with their transactions). An empty read changes nothing: a bank never loses every account at
   * once, Pluggy only stumbles.
   */
  async replaceAccounts(itemId: string, accounts: StoredAccount[]): Promise<void> {
    if (accounts.length === 0) return;
    await this.db.transaction(async (tx) => {
      const ids = accounts.map((account) => account.accountId);
      await tx
        .delete(bankAccounts)
        .where(
          and(
            eq(bankAccounts.userId, this.userId),
            eq(bankAccounts.itemId, itemId),
            notInArray(bankAccounts.accountId, ids),
          ),
        );
      for (const account of accounts) {
        const values = {
          itemId,
          kind: account.kind,
          name: account.name,
          balance: account.balance,
          currency: account.currency,
          balanceAt: account.balanceAt ?? null,
          creditLimit: account.creditLimit ?? null,
          availableCredit: account.availableCredit ?? null,
          dueDate: account.dueDate ?? null,
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
