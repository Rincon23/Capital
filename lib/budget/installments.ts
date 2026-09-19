import { formatMonthLabel } from './date';
import { round2 } from './money';
import type { Expense, InstallmentPlan, Month } from './types';

/**
 * Instalment plans, computed — never stored. In the spreadsheet the end date and the number of
 * instalments left were written as plain numbers, so a plan that had already finished stayed on
 * the list forever (correction 15 of the bot spec). Here every one of those numbers comes from
 * the first charge, the count and today's date.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * `date` shifted by `months`, clamped to the last day of the target month: 31/01 + 1 month is
 * 28/02, not 03/03. Works on "YYYY-MM-DD" strings, so no time zone is ever involved.
 */
export function addMonthsClamped(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(day, lastDayOfTarget))}`;
}

/** Every charge date of the plan, oldest first: `addMonths(firstDebitDate, k)` for k = 0..count-1. */
export function installmentDueDates(plan: Pick<InstallmentPlan, 'firstDebitDate' | 'count'>): string[] {
  return Array.from({ length: Math.max(0, plan.count) }, (_, k) =>
    addMonthsClamped(plan.firstDebitDate, k),
  );
}

/**
 * The value of one instalment, `totalAmount / count`, deliberately **not** rounded: the card debt
 * is the sum of many of them (872,36 in 10× is 87,236 each), and rounding here would drift by
 * cents on every plan. Round only when the instalment becomes an expense or is displayed.
 */
export function installmentAmount(plan: Pick<InstallmentPlan, 'totalAmount' | 'count'>): number {
  if (plan.count <= 0) return 0;
  return plan.totalAmount / plan.count;
}

/** The last charge date of the plan ("fim"). */
export function installmentEndDate(plan: Pick<InstallmentPlan, 'firstDebitDate' | 'count'>): string {
  const dates = installmentDueDates(plan);
  return dates[dates.length - 1] ?? plan.firstDebitDate;
}

/** The charges still to come: every due date **after** today (correction 8). */
export function remainingDueDates(
  plan: Pick<InstallmentPlan, 'firstDebitDate' | 'count'>,
  todayIso: string,
): string[] {
  return installmentDueDates(plan).filter((due) => due > todayIso);
}

export function remainingInstallments(
  plan: Pick<InstallmentPlan, 'firstDebitDate' | 'count'>,
  todayIso: string,
): number {
  return remainingDueDates(plan, todayIso).length;
}

/** A plan with no charges left. It is not deleted — it moves to the "Encerrados" section. */
export function isInstallmentFinished(
  plan: Pick<InstallmentPlan, 'firstDebitDate' | 'count'>,
  todayIso: string,
): boolean {
  return remainingInstallments(plan, todayIso) === 0;
}

/** Plans ordered the way the bot listed them: fewest instalments left first, then by name. */
export function sortInstallments<T extends InstallmentPlan>(plans: T[], todayIso: string): T[] {
  return [...plans].sort((a, b) => {
    const diff = remainingInstallments(a, todayIso) - remainingInstallments(b, todayIso);
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'pt-BR');
  });
}

/** The id the expense of instalment `number` always gets, so launching it twice is impossible. */
export function installmentExpenseId(planId: string, number: number): string {
  return `${planId}:${number}`;
}

/** The competences the charges of `plan` fall in, oldest first and without repeats. */
export function installmentMonths(plan: Pick<InstallmentPlan, 'firstDebitDate' | 'count'>): Month[] {
  const months = new Set(installmentDueDates(plan).map((date) => date.slice(0, 7)));
  return [...months].sort();
}

/**
 * Every competence a purchase touches: where its charges fall and, for an "à vista" plan, the
 * month the whole amount lands in the budget. A closed month among them stops the whole
 * operation (see `closedMonthsMessage`).
 */
export function monthsTouchedBy(
  plan: Pick<InstallmentPlan, 'firstDebitDate' | 'count' | 'accounting' | 'purchaseDate'>,
): Month[] {
  const months = new Set(installmentMonths(plan));
  if (plan.accounting === 'upfront') months.add(upfrontDate(plan).slice(0, 7));
  return [...months].sort();
}

/**
 * Why a purchase with a charge in a closed month cannot be created, edited or deleted. A closed
 * month is the month's own record: the way through is to reopen it, not to leave the purchase
 * half done, so the app refuses the whole operation and says which months are in the way.
 */
export function closedMonthsMessage(closed: Month[]): string {
  const names = closed.map(formatMonthLabel);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
  const what = closed.length === 1 ? 'um mês fechado' : 'meses fechados';
  return `Esta compra tem parcelas em ${what} (${list}). Reabra o mês para poder editar.`;
}

/** The instalments of `plan` charged during competence `month` (1-based), if any. */
export function installmentsDueIn(
  plans: InstallmentPlan[],
  month: Month,
): { plan: InstallmentPlan; number: number; dueDate: string }[] {
  const due: { plan: InstallmentPlan; number: number; dueDate: string }[] = [];
  for (const plan of plans) {
    // Only "Parcelada" plans become expenses; an "À vista" plan was already paid in full.
    if (plan.accounting !== 'installment') continue;
    installmentDueDates(plan).forEach((dueDate, index) => {
      if (dueDate.startsWith(month)) due.push({ plan, number: index + 1, dueDate });
    });
  }
  return due;
}

/** The expense that represents one instalment: always a card purchase, in the charge's month. */
export function installmentExpense(plan: InstallmentPlan, number: number, dueDate: string): Expense {
  const expense: Expense = {
    id: installmentExpenseId(plan.id, number),
    categoryKind: plan.categoryKind,
    description: `${plan.name} ${number}/${plan.count}`,
    amount: round2(installmentAmount(plan)),
    date: dueDate,
    singleInstallmentCard: true,
    source: 'installment',
    installmentId: plan.id,
    installmentNumber: number,
  };
  if (plan.cardId) expense.cardId = plan.cardId;
  if (plan.topicId) expense.topicId = plan.topicId;
  return expense;
}

/**
 * What the instalment plans still owe, as a negative number: every charge of a competence
 * **later** than the current one, whether or not it already became an expense line.
 *
 * The cut is the competence, not today's date, because everything up to the current competence
 * is already part of a card bill (`cardBills`), and the Reserva de emergência adds the two up —
 * so each real is counted once: open bills + what the instalments will still bring.
 */
export function installmentDebt(plans: InstallmentPlan[], currentMonth: Month): number {
  let total = 0;
  for (const plan of plans) {
    const amount = installmentAmount(plan);
    for (const dueDate of installmentDueDates(plan)) {
      if (dueDate.slice(0, 7) > currentMonth) total += amount;
    }
  }
  return -round2(total);
}

/** The day an "à vista" plan's single expense falls on: the purchase, or the first charge. */
export function upfrontDate(plan: Pick<InstallmentPlan, 'purchaseDate' | 'firstDebitDate'>): string {
  return plan.purchaseDate ?? plan.firstDebitDate;
}

/**
 * The single expense an "à vista" plan creates: the whole purchase, in the category, in the
 * month it was bought. It carries `installmentNumber: 0`, which is what tells the bill math to
 * leave it out — it is budget, not a charge the bank makes (see `bill.ts`).
 */
export function upfrontExpense(plan: InstallmentPlan, date = upfrontDate(plan)): Expense {
  const expense: Expense = {
    id: installmentExpenseId(plan.id, 0),
    categoryKind: plan.categoryKind,
    description: plan.name,
    amount: round2(plan.totalAmount),
    date,
    singleInstallmentCard: true,
    source: 'installment',
    installmentId: plan.id,
    installmentNumber: 0,
  };
  if (plan.cardId) expense.cardId = plan.cardId;
  if (plan.topicId) expense.topicId = plan.topicId;
  return expense;
}
