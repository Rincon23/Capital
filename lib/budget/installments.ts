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
 * What the card still owes for the instalment plans, as a negative number:
 * `−Σ(instalment × charges after today that are not expenses yet)`.
 *
 * Charges that already became an expense are left out, otherwise an instalment launched in the
 * open month whose due date is still ahead would be counted twice — once in the card bill of the
 * month, once here.
 */
export function installmentDebt(
  plans: InstallmentPlan[],
  todayIso: string,
  launchedExpenseIds: ReadonlySet<string> = new Set(),
): number {
  let total = 0;
  for (const plan of plans) {
    const amount = installmentAmount(plan);
    installmentDueDates(plan).forEach((dueDate, index) => {
      if (dueDate <= todayIso) return;
      if (launchedExpenseIds.has(installmentExpenseId(plan.id, index + 1))) return;
      total += amount;
    });
  }
  return -round2(total);
}

/** The single expense an "À vista" plan offers to launch: the whole purchase, on the card. */
export function upfrontExpense(plan: InstallmentPlan, id: string, date: string): Expense {
  const expense: Expense = {
    id,
    categoryKind: plan.categoryKind,
    description: plan.name,
    amount: round2(plan.totalAmount),
    date,
    singleInstallmentCard: true,
    source: 'installment',
  };
  if (plan.cardId) expense.cardId = plan.cardId;
  if (plan.topicId) expense.topicId = plan.topicId;
  return expense;
}
