import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import {
  gmailMessageUrl,
  normalizeKeyword,
  sameKeyword,
  type GmailAccountStatus,
  type GmailAlert,
  type GmailKeyword,
} from '@/lib/gmail';
import { gmailAccounts, gmailAlerts, gmailKeywords } from '../db/schema';
import type { Database } from '../db/types';
import { HttpError } from '../httpError';
import { decryptSecret, encryptSecret } from '../secretBox';

const MAX_KEYWORDS = 50;
const ALERTS_SHOWN = 50;

/** One user's Gmail monitor: the connected account, the keywords and the alert history. */
export class PostgresGmailRepository {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  async getAccount(): Promise<GmailAccountStatus | null> {
    const [row] = await this.db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, this.userId));
    if (!row) return null;
    return {
      email: row.email,
      connectedAt: row.connectedAt.toISOString(),
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      status: row.status,
      lastError: row.lastError,
    };
  }

  /** The stored refresh token, decrypted, and the account's check position. */
  async getCredentials(): Promise<{
    email: string;
    refreshToken: string;
    lastHistoryId: string | null;
  } | null> {
    const [row] = await this.db.select().from(gmailAccounts).where(eq(gmailAccounts.userId, this.userId));
    if (!row) return null;
    return {
      email: row.email,
      refreshToken: decryptSecret(row.refreshToken),
      lastHistoryId: row.lastHistoryId,
    };
  }

  /** Connects (or reconnects) the account; checks start from `historyId`, so older mail is left alone. */
  async saveAccount(email: string, refreshToken: string, historyId: string): Promise<void> {
    const values = {
      email,
      refreshToken: encryptSecret(refreshToken),
      lastHistoryId: historyId,
      status: 'ok' as const,
      lastError: null,
      lastCheckedAt: null,
      connectedAt: new Date(),
    };
    await this.db
      .insert(gmailAccounts)
      .values({ userId: this.userId, ...values })
      .onConflictDoUpdate({ target: gmailAccounts.userId, set: values });
  }

  async deleteAccount(): Promise<void> {
    await this.db.delete(gmailAccounts).where(eq(gmailAccounts.userId, this.userId));
  }

  async recordCheck(
    result: { historyId?: string; error?: string; reconnect?: boolean },
    now: Date,
  ): Promise<void> {
    await this.db
      .update(gmailAccounts)
      .set({
        ...(result.historyId ? { lastHistoryId: result.historyId } : {}),
        status: result.reconnect ? 'reconnect' : result.error ? 'error' : 'ok',
        lastError: result.error ?? null,
        lastCheckedAt: now,
      })
      .where(eq(gmailAccounts.userId, this.userId));
  }

  async listKeywords(): Promise<GmailKeyword[]> {
    const rows = await this.db
      .select()
      .from(gmailKeywords)
      .where(eq(gmailKeywords.userId, this.userId))
      .orderBy(gmailKeywords.createdAt);
    return rows.map((row) => ({ id: row.id, keyword: row.keyword, createdAt: row.createdAt.toISOString() }));
  }

  async addKeyword(input: string): Promise<GmailKeyword> {
    const keyword = normalizeKeyword(input);
    if (!keyword) throw new HttpError(400, 'INVALID_INPUT', 'Escreva a palavra-chave.');
    const existing = await this.listKeywords();
    if (existing.some((other) => sameKeyword(other.keyword, keyword))) {
      throw new HttpError(409, 'DUPLICATE_KEYWORD', 'Essa palavra-chave já está na lista.');
    }
    if (existing.length >= MAX_KEYWORDS) {
      throw new HttpError(409, 'TOO_MANY_KEYWORDS', `Dá para monitorar até ${MAX_KEYWORDS} palavras-chave.`);
    }
    const [row] = await this.db.insert(gmailKeywords).values({ userId: this.userId, keyword }).returning();
    return { id: row.id, keyword: row.keyword, createdAt: row.createdAt.toISOString() };
  }

  async deleteKeyword(id: string): Promise<void> {
    await this.db
      .delete(gmailKeywords)
      .where(and(eq(gmailKeywords.userId, this.userId), eq(gmailKeywords.id, id)));
  }

  async listAlerts(accountEmail: string | null): Promise<GmailAlert[]> {
    const rows = await this.db
      .select()
      .from(gmailAlerts)
      .where(eq(gmailAlerts.userId, this.userId))
      .orderBy(desc(gmailAlerts.receivedAt))
      .limit(ALERTS_SHOWN);
    return rows.map((row) => ({
      messageId: row.messageId,
      keywords: row.keywords,
      subject: row.subject,
      from: row.from,
      receivedAt: row.receivedAt.toISOString(),
      notifiedAt: row.notifiedAt?.toISOString() ?? null,
      url: accountEmail
        ? gmailMessageUrl(accountEmail, row.messageId)
        : `https://mail.google.com/mail/#all/${row.messageId}`,
    }));
  }

  /**
   * Records the alert for an e-mail; false when it was already recorded, which is what keeps an
   * e-mail from being notified twice (correction 13).
   */
  async recordAlert(alert: {
    messageId: string;
    keywords: string[];
    subject: string;
    from: string;
    receivedAt: Date;
  }): Promise<boolean> {
    const inserted = await this.db
      .insert(gmailAlerts)
      .values({ userId: this.userId, ...alert })
      .onConflictDoNothing()
      .returning({ messageId: gmailAlerts.messageId });
    return inserted.length > 0;
  }

  async markNotified(messageId: string, now: Date): Promise<void> {
    await this.db
      .update(gmailAlerts)
      .set({ notifiedAt: now })
      .where(and(eq(gmailAlerts.userId, this.userId), eq(gmailAlerts.messageId, messageId)));
  }
}
