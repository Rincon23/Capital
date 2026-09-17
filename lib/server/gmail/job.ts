import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { gmailAlertNotification, isReceivedMail, matchKeywords } from '@/lib/gmail';
import { budgetSettings, gmailAccounts } from '../db/schema';
import type { Database } from '../db/types';
import { sendPushToUser, type PushSender } from '../push';
import {
  GmailAuthError,
  GmailHistoryExpiredError,
  googleConfig,
  googleGmailApi,
  type GmailApi,
} from './google';
import { PostgresGmailRepository } from './repository';

/**
 * The Gmail monitor's check, once a minute for every connected account whose owner has the
 * module on (bot spec §4.12, correction 13): new mail since the last check, one notification per
 * e-mail with every keyword it contains, never the same e-mail twice.
 */

/** More new mail than this in one minute (a mailbox import, say) is only partly read. */
const MAX_MESSAGES_PER_CHECK = 100;
/** A notification about an e-mail is still useful some hours late. */
const ALERT_TTL_SECONDS = 12 * 60 * 60;

const globalForGmail = globalThis as unknown as {
  capitalGmailTokens?: Map<string, { token: string; expiresAt: number }>;
};

function tokenCache() {
  globalForGmail.capitalGmailTokens ??= new Map();
  return globalForGmail.capitalGmailTokens;
}

export function forgetGmailToken(userId: string): void {
  tokenCache().delete(userId);
}

async function accessToken(api: GmailApi, userId: string, refreshToken: string, now: Date): Promise<string> {
  const cached = tokenCache().get(userId);
  if (cached && cached.expiresAt > now.getTime() + 60_000) return cached.token;
  const fresh = await api.accessToken(refreshToken);
  tokenCache().set(userId, { token: fresh.token, expiresAt: now.getTime() + fresh.expiresInSeconds * 1000 });
  return fresh.token;
}

export interface GmailCheckResult {
  checked: number;
  alerts: number;
  status: 'ok' | 'error' | 'reconnect' | 'not_connected';
  error?: string;
}

export interface GmailJobDeps {
  api?: GmailApi;
  sender?: PushSender;
}

/** Checks one user's account now (the job, and the "Verificar agora" button). */
export async function checkGmailAccount(
  db: Database,
  userId: string,
  now: Date = new Date(),
  deps: GmailJobDeps = {},
): Promise<GmailCheckResult> {
  const repo = new PostgresGmailRepository(db, userId);
  const previous = await repo.getAccount();
  if (!previous) return { checked: 0, alerts: 0, status: 'not_connected' };

  const config = googleConfig();
  const api = deps.api ?? (config ? googleGmailApi(config) : null);
  if (!api)
    return { checked: 0, alerts: 0, status: 'error', error: 'O Google não está configurado no servidor.' };

  try {
    let credentials: NonNullable<Awaited<ReturnType<PostgresGmailRepository['getCredentials']>>>;
    try {
      credentials = (await repo.getCredentials())!;
    } catch {
      // The token can't be decrypted (ENCRYPTION_KEY changed): only a new connection fixes it.
      throw new GmailAuthError('não foi possível ler a conexão guardada (a ENCRYPTION_KEY mudou).');
    }
    const token = await accessToken(api, userId, credentials.refreshToken, now);

    let messageIds: string[];
    let historyId: string;
    if (credentials.lastHistoryId) {
      try {
        ({ messageIds, historyId } = await api.history(token, credentials.lastHistoryId));
      } catch (err) {
        if (!(err instanceof GmailHistoryExpiredError)) throw err;
        // Too long without checking: look at the last day instead; recorded alerts aren't repeated.
        messageIds = await api.recentMessageIds(token);
        historyId = (await api.profile(token)).historyId;
      }
    } else {
      historyId = (await api.profile(token)).historyId;
      messageIds = [];
    }

    const keywords = (await repo.listKeywords()).map((row) => row.keyword);
    let alerts = 0;
    let checked = 0;
    if (messageIds.length > MAX_MESSAGES_PER_CHECK) {
      console.warn(
        `[gmail] ${messageIds.length} e-mails novos de uma vez; só os ${MAX_MESSAGES_PER_CHECK} primeiros foram lidos.`,
      );
    }
    if (keywords.length > 0) {
      for (const id of messageIds.slice(0, MAX_MESSAGES_PER_CHECK)) {
        const message = await api.message(token, id);
        if (!message || !isReceivedMail(message.labelIds)) continue;
        checked += 1;
        const found = matchKeywords(message, keywords);
        if (found.length === 0) continue;

        const recorded = await repo.recordAlert({
          messageId: message.id,
          keywords: found,
          subject: message.subject,
          from: message.from,
          receivedAt: new Date(message.receivedAt),
        });
        if (!recorded) continue;
        await sendPushToUser(db, userId, gmailAlertNotification(message, found, credentials.email), {
          sender: deps.sender,
          ttlSeconds: ALERT_TTL_SECONDS,
          urgency: 'high',
        });
        await repo.markNotified(message.id, now);
        alerts += 1;
      }
    }

    await repo.recordCheck({ historyId }, now);
    return { checked, alerts, status: 'ok' };
  } catch (err) {
    forgetGmailToken(userId);
    if (err instanceof GmailAuthError) {
      await repo.recordCheck(
        { reconnect: true, error: 'O Google não aceita mais a conexão. Conecte o Gmail de novo.' },
        now,
      );
      // Tell the user once, when it stops working, not every minute.
      if (previous?.status !== 'reconnect') {
        await sendPushToUser(
          db,
          userId,
          {
            title: '📩 O monitor de Gmail parou',
            body: 'O Google não aceita mais a conexão. Toque para conectar de novo.',
            url: '/gmail',
            tag: 'gmail-reconnect',
          },
          { sender: deps.sender, urgency: 'normal' },
        ).catch((pushErr) => console.error('[gmail] aviso de reconexão falhou:', pushErr));
      }
      return { checked: 0, alerts: 0, status: 'reconnect', error: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    await repo.recordCheck({ error: `A última verificação falhou: ${message}` }, now);
    return { checked: 0, alerts: 0, status: 'error', error: message };
  }
}

/** Every account whose owner has the module on and that Google still accepts. */
export async function runGmailJob(
  db: Database,
  now: Date = new Date(),
  deps: GmailJobDeps = {},
): Promise<{ accounts: number; alerts: number }> {
  if (!deps.api && !googleConfig()) return { accounts: 0, alerts: 0 };
  const accounts = await db
    .select({ userId: gmailAccounts.userId })
    .from(gmailAccounts)
    .innerJoin(budgetSettings, eq(budgetSettings.userId, gmailAccounts.userId))
    .where(
      sql`${gmailAccounts.status} <> 'reconnect' and coalesce((${budgetSettings.modules}->>'gmail')::boolean, false)`,
    );

  let alerts = 0;
  for (const { userId } of accounts) {
    try {
      alerts += (await checkGmailAccount(db, userId, now, deps)).alerts;
    } catch (err) {
      console.error('[gmail] falha ao verificar uma conta:', err);
    }
  }
  return { accounts: accounts.length, alerts };
}
