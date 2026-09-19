import { nextMonth } from './date';
import { round2, sum } from './money';
import type { CardBillPayment, CardSettings, CreditCard, Month } from './types';

/**
 * The registered credit cards and their bills (module "Cartões").
 *
 * A bill is the pair (card, competence). There are two ways one stops being a debt, and the
 * difference between them is the whole point of the module:
 *
 * - **No registered card** (`cardId` null): the bill of competence M pays itself on the 1st of
 *   M+1. Nothing to press, nothing stored — it is only a date.
 * - **A registered card**: the bill is due on the card's day and only leaves the debt when the
 *   person taps "Fatura paga". Not tapping keeps it there, late, for as long as it takes.
 *
 * Nothing here is stored: the due date, the postponement off a weekend and how late a bill is
 * all come from the card's `dueDay` and today's date.
 */

export const DEFAULT_CARD_SETTINGS: CardSettings = {
  notifyTime: '09:00',
  repeatUntilPaid: true,
};

/** How many days before the due date the extra notice can go out (0 = only on the day). */
export const CARD_NOTIFY_BEFORE_OPTIONS = [0, 1, 2, 3, 5, 7] as const;

/** How the bill of the purchases that are on no registered card is called. */
export const NO_CARD_LABEL = 'Sem cartão';

/** A card that notifies more than a week late is let go — nobody needs a daily nag forever. */
export const LATE_NOTICE_DAYS = 7;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function lastDayOfMonth(month: Month): number {
  const [year, monthNum] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
}

/** `date` shifted by `days`, on "YYYY-MM-DD" strings (UTC math, so no time zone is involved). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Whole days from `from` to `to`: 0 the same day, negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const toUtc = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/**
 * Saturdays and Sundays are not banking days: a bill due on one is paid on the Monday. It may
 * land in the next month (a Sunday the 31st becomes the 1st) — that is right, and it never
 * changes which competence the bill belongs to. Holidays are not considered: they would need a
 * calendar the app does not have.
 */
export function nextBankingDay(date: string): string {
  const weekday = weekdayOf(date);
  if (weekday === 6) return addDays(date, 2);
  if (weekday === 0) return addDays(date, 1);
  return date;
}

/** The card's day for the bill of `month`, before the weekend is taken into account. */
export function nominalDueDate(card: Pick<CreditCard, 'dueDay' | 'dueMonth'>, month: Month): string {
  const target = card.dueMonth === 'same' ? month : nextMonth(month);
  return `${target}-${pad(Math.min(card.dueDay, lastDayOfMonth(target)))}`;
}

/** The day the bill of `month` is actually paid on: the card's day, off the weekend. */
export function billDueDate(card: Pick<CreditCard, 'dueDay' | 'dueMonth'>, month: Month): string {
  return nextBankingDay(nominalDueDate(card, month));
}

/** The day the "sem cartão" bill of `month` leaves the debt on its own. */
export function noCardClearDate(month: Month): string {
  return `${nextMonth(month)}-01`;
}

/** What each card owes in one competence, as the database groups it. */
export interface CardBillTotal {
  month: Month;
  /** Null for card purchases that are not on any registered card. */
  cardId: string | null;
  total: number;
}

/** One bill, ready for the screens. */
export interface CardBill {
  /** Null for the "sem cartão" bill. */
  cardId: string | null;
  cardName: string;
  month: Month;
  total: number;
  paid: boolean;
  /** ISO instant of "Fatura paga". */
  paidAt: string | null;
  /** The day it is paid on (the card's day, off the weekend); null for "sem cartão". */
  dueDate: string | null;
  /** The card's own day, when the weekend pushed the bill off it. */
  postponedFrom: string | null;
  /** Days from today to `dueDate`: 0 today, negative when it is late. */
  daysUntilDue: number | null;
  /** The day the "sem cartão" bill leaves on its own (the 1st of the next month). */
  clearsOn: string | null;
}

export function billKey(bill: Pick<CardBill, 'cardId' | 'month'>): string {
  return `${bill.cardId ?? 'sem-cartao'}:${bill.month}`;
}

/**
 * Every bill worth showing: the open ones of each registered card (however old), the ones
 * already paid (so the screen can say so) and the "sem cartão" bill while it has not cleared.
 * Ordered by the day they have to be paid.
 */
export function cardBills(
  cards: CreditCard[],
  totals: CardBillTotal[],
  payments: CardBillPayment[],
  today: string,
): CardBill[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const paidAt = new Map(payments.map((payment) => [`${payment.cardId}:${payment.month}`, payment.paidAt]));
  // A card that no longer exists falls back to "sem cartão", together with the untagged purchases.
  const noCard = new Map<Month, number>();
  const bills: CardBill[] = [];

  for (const row of totals) {
    const total = round2(row.total);
    if (total <= 0) continue;
    const card = row.cardId ? byId.get(row.cardId) : undefined;
    if (!card) {
      noCard.set(row.month, round2((noCard.get(row.month) ?? 0) + total));
      continue;
    }
    const nominal = nominalDueDate(card, row.month);
    const dueDate = nextBankingDay(nominal);
    const when = paidAt.get(`${card.id}:${row.month}`) ?? null;
    bills.push({
      cardId: card.id,
      cardName: card.name,
      month: row.month,
      total,
      paid: when !== null,
      paidAt: when,
      dueDate,
      postponedFrom: dueDate === nominal ? null : nominal,
      daysUntilDue: daysBetween(today, dueDate),
      clearsOn: null,
    });
  }

  for (const [month, total] of noCard) {
    const clearsOn = noCardClearDate(month);
    if (today >= clearsOn) continue;
    bills.push({
      cardId: null,
      cardName: NO_CARD_LABEL,
      month,
      total,
      paid: false,
      paidAt: null,
      dueDate: null,
      postponedFrom: null,
      daysUntilDue: null,
      clearsOn,
    });
  }

  return bills.sort((a, b) => {
    const dayA = a.dueDate ?? a.clearsOn ?? '';
    const dayB = b.dueDate ?? b.clearsOn ?? '';
    return dayA.localeCompare(dayB) || a.cardName.localeCompare(b.cardName, 'pt-BR');
  });
}

export function openBills(bills: CardBill[]): CardBill[] {
  return bills.filter((bill) => !bill.paid);
}

/** What the cards still owe, as a negative number, for the cash report. */
export function openCardDebt(bills: CardBill[]): number {
  return -round2(sum(openBills(bills).map((bill) => bill.total)));
}

/** The open bill to be paid first (the "sem cartão" one never counts: nobody pays it by hand). */
export function nextBillToPay(bills: CardBill[]): CardBill | null {
  return openBills(bills).find((bill) => bill.dueDate !== null) ?? null;
}

/** Open bills already past their day. */
export function lateBills(bills: CardBill[]): CardBill[] {
  return openBills(bills).filter((bill) => bill.daysUntilDue !== null && bill.daysUntilDue < 0);
}

/** "vence hoje", "vence em 3 dias", "atrasada há 2 dias". */
export function dueLabel(bill: CardBill): string {
  if (bill.paid) return 'paga';
  if (bill.daysUntilDue === null) return `sai sozinha em ${formatDayMonth(bill.clearsOn ?? '')}`;
  if (bill.daysUntilDue === 0) return 'vence hoje';
  if (bill.daysUntilDue === 1) return 'vence amanhã';
  if (bill.daysUntilDue > 1) return `vence em ${bill.daysUntilDue} dias`;
  const late = -bill.daysUntilDue;
  return late === 1 ? 'atrasada há 1 dia' : `atrasada há ${late} dias`;
}

/** "2026-09-04" -> "04/09". */
export function formatDayMonth(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

/** The days a bill is notified on: the notice before, the due day itself, and the late nagging. */
export function billNoticeDays(
  card: Pick<CreditCard, 'dueDay' | 'dueMonth' | 'notifyBeforeDays'>,
  month: Month,
  settings: CardSettings,
): { advance: string | null; due: string; late: string[] } {
  const due = billDueDate(card, month);
  const late = settings.repeatUntilPaid
    ? Array.from({ length: LATE_NOTICE_DAYS }, (_, index) => addDays(due, index + 1))
    : [];
  return {
    advance: card.notifyBeforeDays > 0 ? addDays(due, -card.notifyBeforeDays) : null,
    due,
    late,
  };
}
