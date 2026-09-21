import 'server-only';
import { eq, sql } from 'drizzle-orm';
import {
  budgetSettings,
  cardBillPayments,
  cards,
  cardSettings,
  cashSettings,
  gmailAccounts,
  gmailAlerts,
  gmailKeywords,
  installments,
  investmentBuckets,
  investmentReserves,
  months,
  notifications,
  recurringExpenses,
  reminders,
  reminderSettings,
  reserveContributions,
  reservePlans,
} from './db/schema';
import type { Database } from './db/types';
import { forgetGmailToken } from './gmail/job';

/**
 * "Apagar todos os dados": everything the account stored, in every module — months and their
 * entries, settings, cards and bills, recurring and instalment purchases, reserves, reminders,
 * the Gmail connection (its token included) and the notification history. The account itself
 * stays, and so do the devices that receive notifications; "Excluir minha conta" removes those too.
 * Rows that hang from others (entries, deliveries, completions) go with them by cascade.
 */
export async function clearAccountData(db: Database, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // The same lock every budget write takes: nothing of this account is half-written meanwhile.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    await tx.delete(months).where(eq(months.userId, userId));
    await tx.delete(budgetSettings).where(eq(budgetSettings.userId, userId));
    await tx.delete(cardBillPayments).where(eq(cardBillPayments.userId, userId));
    await tx.delete(cards).where(eq(cards.userId, userId));
    await tx.delete(cardSettings).where(eq(cardSettings.userId, userId));
    await tx.delete(recurringExpenses).where(eq(recurringExpenses.userId, userId));
    await tx.delete(installments).where(eq(installments.userId, userId));
    await tx.delete(reserveContributions).where(eq(reserveContributions.userId, userId));
    await tx.delete(reservePlans).where(eq(reservePlans.userId, userId));
    await tx.delete(investmentBuckets).where(eq(investmentBuckets.userId, userId));
    await tx.delete(investmentReserves).where(eq(investmentReserves.userId, userId));
    await tx.delete(cashSettings).where(eq(cashSettings.userId, userId));
    await tx.delete(reminders).where(eq(reminders.userId, userId));
    await tx.delete(reminderSettings).where(eq(reminderSettings.userId, userId));
    await tx.delete(gmailAlerts).where(eq(gmailAlerts.userId, userId));
    await tx.delete(gmailKeywords).where(eq(gmailKeywords.userId, userId));
    await tx.delete(gmailAccounts).where(eq(gmailAccounts.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
  });
  forgetGmailToken(userId);
}
