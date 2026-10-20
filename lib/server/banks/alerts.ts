import 'server-only';
import {
  connectionHealth,
  consentDaysLeft,
  formatAgo,
  summarizeArrivals,
  type BankConnection,
} from '@/lib/banks';
import { formatBRL } from '@/lib/budget/money';
import { addDays, zonedMoment } from '@/lib/reminders/time';
import type { Database } from '../db/types';
import { sendUserNotifications, type NotifyInput } from '../notify';
import type { PushSender } from '../push';
import type { FetchLike } from './pluggy';
import { PostgresBanksRepository } from './repository';
import { syncUser, type BankSyncResult } from './service';

/**
 * Open Finance on the phone (category "Open Finance"): after each read, one summary per bank with
 * what arrived, the salary on its own, and — once each — a bank that stopped and an authorization
 * about to run out. Every alert has a `sourceKey`, so nothing is ever told twice.
 */

/** Older than this, a transaction that only now arrived is not news anymore. */
const NEWS_DAYS = 7;
/** An alert about money is still worth reading some hours late. */
const ALERT_TTL_SECONDS = 12 * 60 * 60;
/** Where a tap goes (the review of what arrived, once it exists). */
export const BANKS_ALERT_URL = '/bancos';

export interface AlertDeps {
  sender?: PushSender;
}

/** What each bank brought in this read, as alerts (not sent). */
export async function arrivalAlerts(
  repo: PostgresBanksRepository,
  results: BankSyncResult[],
  now: Date,
): Promise<NotifyInput[]> {
  const news = results.filter((result) => result.changed && !result.firstRead && result.added.length > 0);
  if (news.length === 0) return [];
  const settings = await repo.alertSettings();
  const names = await repo.connectionNames();
  const since = addDays(zonedMoment(now).date, -NEWS_DAYS);
  const alerts: NotifyInput[] = [];
  for (const result of news) {
    const bank = names.get(result.itemId) ?? 'Banco';
    const transactions = await repo.alertTransactions(result.added, since);
    const { body, salaries } = summarizeArrivals(transactions, settings);
    for (const salary of salaries) {
      alerts.push({
        category: 'banks',
        sourceKey: `banks-salary:${salary.id}`,
        message: {
          title: '💰 Seu salário caiu',
          body: `${formatBRL(salary.amount)} · ${bank}`,
          url: BANKS_ALERT_URL,
          tag: `banks-salary-${salary.id}`,
        },
      });
    }
    if (body) {
      alerts.push({
        category: 'banks',
        // One summary per read of this bank: the first new transaction stands for the batch.
        sourceKey: `banks-arrivals:${result.itemId}:${[...result.added].sort()[0]}`,
        message: { title: `🏦 ${bank}`, body, url: BANKS_ALERT_URL, tag: `banks-arrivals-${result.itemId}` },
      });
    }
  }
  return alerts;
}

/**
 * A bank that went quiet (48 h without data) and an authorization 15 days from running out: told
 * once per episode (the key carries the date that would change when it is over).
 */
export function healthAlerts(connections: BankConnection[], now: number): NotifyInput[] {
  const alerts: NotifyInput[] = [];
  for (const connection of connections) {
    if (connectionHealth(connection, now) === 'stale' && connection.lastUpdatedAt) {
      alerts.push({
        category: 'banks',
        sourceKey: `banks-stale:${connection.itemId}:${connection.lastUpdatedAt}`,
        message: {
          title: `🏦 ${connection.name} parou`,
          body: `Nenhum dado novo do banco ${formatAgo(connection.lastUpdatedAt, now)}. Toque para reconectar no Meu Pluggy.`,
          url: BANKS_ALERT_URL,
          tag: `banks-stale-${connection.itemId}`,
        },
      });
    }
    const days = connection.status === 'reconnect' ? null : consentDaysLeft(connection, now);
    if (days !== null && connection.consentExpiresAt) {
      alerts.push({
        category: 'banks',
        sourceKey: `banks-consent:${connection.itemId}:${connection.consentExpiresAt}`,
        message: {
          title: `🏦 ${connection.name}: autorização vencendo`,
          body:
            days === 0
              ? 'A autorização vence hoje. Toque para renovar.'
              : `A autorização vence em ${days} ${days === 1 ? 'dia' : 'dias'}. Toque para renovar.`,
          url: BANKS_ALERT_URL,
          tag: `banks-consent-${connection.itemId}`,
        },
      });
    }
  }
  return alerts;
}

/**
 * One person's read (the hourly job and "Buscar novidades"), then what it tells them. Null when a
 * read of this person was already running.
 */
export async function syncAndNotify(
  db: Database,
  userId: string,
  fetchImpl: FetchLike = fetch,
  now = new Date(),
  deps: AlertDeps = {},
): Promise<BankSyncResult[] | null> {
  const repo = new PostgresBanksRepository(db, userId);
  const results = await syncUser(repo, userId, fetchImpl, now);
  if (results === null) return null;
  try {
    const alerts = [
      ...(await arrivalAlerts(repo, results, now)),
      ...healthAlerts(await repo.listConnections(), now.getTime()),
    ];
    if (alerts.length > 0) {
      await sendUserNotifications(db, userId, alerts, {
        sender: deps.sender,
        ttlSeconds: ALERT_TTL_SECONDS,
        urgency: 'normal',
      });
    }
  } catch (err) {
    console.error('[bancos] falha ao avisar:', err instanceof Error ? err.message : err);
  }
  return results;
}
