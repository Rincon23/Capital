import 'server-only';
import { categoryOptions } from '@/lib/ai';
import {
  findDuplicate,
  findDuplicateIncome,
  groupInstallments,
  IGNORE_LABELS,
  ignoreReason,
  matchingPlan,
  memoryKey,
  paybackMemory,
  paybackTolerance,
  payerKey,
  reimbursementCandidates,
  reviewKind,
  suggestCategory,
  type BankReview,
  type CategoryChoice,
  type LaunchedExpense,
  type PaybackOption,
  type ReviewItem,
} from '@/lib/banks';
import { nextMonth, presetOf, previousMonth, round2 } from '@/lib/budget';
import { createId } from '@/lib/budget/id';
import { isModuleOn } from '@/lib/modules';
import { zonedToday } from '@/lib/reminders/time';
import type { Expense, Income, InstallmentPlan, Month } from '@/lib/budget';
import type { PostgresBudgetRepository } from '../budgetRepository';
import { HttpError } from '../httpError';
import type { PostgresWalletRepository } from '../walletRepository';
import type { PostgresBanksRepository, ReviewRow } from './repository';

/**
 * "Confira os gastos" on the server: what arrived and is still to review, already sorted into
 * what to launch (with a suggested category and the manual entry it may duplicate) and what is
 * left out by default (with why); and each decision, applied with the same functions the forms use
 * (`saveExpense`, `saveInstallment`, `saveIncome`), so every rule of bills and months holds.
 */

interface ReviewDeps {
  banks: PostgresBanksRepository;
  repo: PostgresBudgetRepository;
  wallet: PostgresWalletRepository;
}

/** The months a set of days can fall in, with the neighbours (a duplicate is up to 2 days off). */
function monthsAround(dates: string[]): Month[] {
  const months = new Set<Month>();
  for (const date of dates) {
    const month = date.slice(0, 7);
    months.add(month);
    const day = Number(date.slice(8, 10));
    if (day <= 2) months.add(previousMonth(month));
    if (day >= 27) months.add(nextMonth(month));
  }
  return [...months];
}

function baseItem(
  row: ReviewRow,
  transactionIds: string[],
): Omit<ReviewItem, 'kind' | 'category' | 'installments' | 'duplicate' | 'ignored'> {
  const onCard = row.accountKind === 'card';
  return {
    key: row.id,
    transactionIds,
    bankName: row.bankName,
    accountId: row.accountId,
    accountName: row.accountName,
    onCard,
    cardId: onCard ? row.capitalCardId : null,
    date: row.date,
    description: row.description,
    amount: Math.abs(row.amount),
    payer: row.payerName,
    reimbursement: null,
  };
}

export async function buildReview({ banks, repo, wallet }: ReviewDeps): Promise<BankReview> {
  const rows = await banks.reviewTransactions();
  const settings = await repo.getSettings();
  const options = categoryOptions(settings);
  // The default categories the person kept, by what they mean (see `suggestCategory`); older
  // data has no `preset` and is known by the default's name, as everywhere else in the app.
  const presets: Record<string, string> = {};
  for (const topic of settings.topics) {
    const preset = topic.archived ? undefined : presetOf(topic)?.preset;
    if (preset) presets[preset] = topic.id;
  }
  const memory = await banks.categoryMemory();
  const plans = await wallet.listInstallments();
  const taken = await banks.takenEntryIds();
  // The "A receber" still open, when that module is on: a Pix received may be one paid back.
  const pendingBack: LaunchedExpense[] = isModuleOn(settings, 'reimbursable')
    ? await repo.pendingReimbursables(zonedToday().slice(0, 7))
    : [];
  // Who paid back what before: a payer the person already confirmed is recognised.
  const paidBack = pendingBack.length > 0 ? paybackMemory(await banks.paybackHistory()) : new Map();

  const launched: LaunchedExpense[] = [];
  const incomes: { month: Month; income: Income }[] = [];
  for (const month of monthsAround(rows.map((row) => row.date))) {
    const data = await repo.getMonth(month);
    if (!data) continue;
    for (const expense of data.expenses) launched.push({ month, expense });
    for (const income of data.incomes) incomes.push({ month, income });
  }

  const items: ReviewItem[] = [];
  const splits = rows.filter((row) => reviewKind(row) === 'plan' && !ignoreReason(row));

  for (const group of groupInstallments(splits)) {
    const first = group.transactions[0] as ReviewRow;
    const plan = matchingPlan(group, plans, first.capitalCardId);
    items.push({
      ...baseItem(first, group.transactions.map((member) => member.id)),
      date: group.purchaseDate,
      amount: group.total,
      kind: 'plan',
      category: suggestCategory(first, options, memory, presets),
      installments: {
        count: group.count,
        numbers: group.numbers,
        installmentAmount: group.installmentAmount,
        total: group.total,
        purchaseDate: group.purchaseDate,
      },
      duplicate: null,
      ignored: plan ? { reason: 'in_plan', label: `${IGNORE_LABELS.in_plan}: ${plan.name}` } : null,
    });
  }

  for (const row of rows) {
    const reason = ignoreReason(row);
    const kind = reviewKind(row);
    if (kind === 'plan' && !reason) continue;
    const base = baseItem(row, [row.id]);
    const payer = payerKey(row);
    const paybacks =
      kind === 'income' && !reason
        ? reimbursementCandidates(base, pendingBack, taken, payer ? paidBack.get(payer) : undefined)
        : [];
    if (paybacks.length > 0) {
      const option = ({ month, expense }: LaunchedExpense): PaybackOption => ({
        month,
        expenseId: expense.id,
        description: expense.description,
        amount: expense.amount,
        difference: round2(base.amount - expense.amount),
      });
      // One "A receber" is offered first to one Pix at most (the others stay a tap away).
      taken.add(paybacks[0].expense.id);
      base.reimbursement = { ...option(paybacks[0]), others: paybacks.slice(1, 6).map(option) };
    }
    const duplicate =
      reason !== null
        ? null
        : kind === 'income'
          ? findDuplicateIncome(base, incomes, taken)
          : findDuplicate(base, launched, taken);
    items.push({
      ...base,
      kind: kind === 'plan' ? 'expense' : kind,
      category: kind === 'income' || reason ? null : suggestCategory(row, options, memory, presets),
      installments: null,
      duplicate: duplicate
        ? 'expense' in duplicate
          ? {
              month: duplicate.month,
              entryId: duplicate.expense.id,
              description: duplicate.expense.description,
              amount: duplicate.expense.amount,
              date: duplicate.expense.date,
            }
          : {
              month: duplicate.month,
              entryId: duplicate.income.id,
              description: duplicate.income.source,
              amount: duplicate.income.amount,
              date: duplicate.income.date ?? `${duplicate.month}-01`,
            }
        : null,
      ignored: reason ? { reason, label: IGNORE_LABELS[reason] } : null,
    });
    // One manual entry is the duplicate of one bank transaction at most.
    if (duplicate) taken.add('expense' in duplicate ? duplicate.expense.id : duplicate.income.id);
  }

  items.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
  return {
    items: items.filter((item) => !item.ignored),
    ignored: items.filter((item) => item.ignored),
    cards: await banks.reviewCards(),
  };
}

/** One decision about one line (all its transactions together). */
export type ReviewAction =
  | { action: 'expense'; transactionIds: string[]; month: Month; expense: Expense }
  | { action: 'plan'; transactionIds: string[]; plan: InstallmentPlan }
  | { action: 'income'; transactionIds: string[]; month: Month; income: Income }
  | { action: 'linked'; transactionIds: string[]; month: Month; entryId: string }
  | { action: 'reimbursed'; transactionIds: string[]; month: Month; expenseId: string }
  | { action: 'ignore'; transactionIds: string[] }
  | { action: 'bill'; transactionIds: string[] };

/**
 * Applies a decision. The transactions are taken first (a second tap, or another device, gets
 * "já está no Capital" instead of a second entry), the entry is saved by the same function the
 * form uses, and only then are they marked with what they became. A failure gives them back.
 */
export async function applyReviewAction({ banks, repo, wallet }: ReviewDeps, input: ReviewAction): Promise<void> {
  const ids = [...new Set(input.transactionIds)];
  if (!(await banks.claim(ids))) {
    throw new HttpError(409, 'ALREADY_REVIEWED', 'Isso já foi conferido. A lista foi atualizada.');
  }
  try {
    const remember = async (choice: CategoryChoice) => {
      const description = await banks.descriptionOf(ids[0]);
      if (description) await banks.remember(memoryKey(description), choice);
    };
    switch (input.action) {
      case 'expense':
        await repo.saveExpense(input.month, { ...input.expense, source: 'import' });
        await remember(input.expense);
        await banks.settle(ids, 'expense', input.expense.id, input.month);
        break;
      case 'plan':
        await wallet.saveInstallment(input.plan);
        await remember(input.plan);
        await banks.settle(ids, 'plan', input.plan.id, null);
        break;
      case 'income':
        await repo.saveIncome(input.month, input.income);
        await banks.settle(ids, 'income', input.income.id, input.month);
        break;
      case 'linked':
        await banks.settle(ids, 'linked', input.entryId, input.month);
        break;
      case 'reimbursed':
        await settlePayback({ banks, repo }, ids, input.month, input.expenseId);
        break;
      case 'ignore':
        await banks.settle(ids, 'ignored', null, null);
        break;
      case 'bill':
        await banks.settle(ids, 'bill', null, null);
        break;
    }
  } catch (err) {
    await banks.release(ids);
    throw err;
  }
}

/**
 * "Marcar como recebido": the same "Já me pagou" as the A receber screen (`setReimbursed`). A Pix a
 * little off settles it too (`paybackTolerance`): what came beyond it becomes an income, and what
 * was missing an expense in Imprevistos, on the day of the Pix — both saved first, by the forms'
 * own functions, so a closed month refuses the whole thing.
 */
async function settlePayback(
  { banks, repo }: Pick<ReviewDeps, 'banks' | 'repo'>,
  ids: string[],
  month: Month,
  expenseId: string,
): Promise<void> {
  const owed = (await repo.pendingReimbursables(month)).find(
    (pending) => pending.month === month && pending.expense.id === expenseId,
  );
  if (!owed) throw new HttpError(404, 'NOT_FOUND', 'Esse A receber não existe mais ou já foi recebido.');
  const paid = await banks.paidIn(ids);
  if (!paid) throw new HttpError(404, 'NOT_FOUND', 'Essa transação não está mais no Capital.');
  const difference = round2(paid.amount - owed.expense.amount);
  if (Math.abs(difference) > paybackTolerance(owed.expense.amount) + 0.009) {
    throw new HttpError(400, 'TOO_FAR', 'O valor do Pix está longe demais desse A receber.');
  }
  const day = paid.date;
  const { description } = owed.expense;
  if (difference >= 0.01) {
    await repo.saveIncome(day.slice(0, 7), {
      id: createId(),
      source: `Devolução a mais: ${description}`,
      amount: difference,
      date: day,
    });
  } else if (difference <= -0.01) {
    await repo.saveExpense(day.slice(0, 7), {
      id: createId(),
      categoryKind: 'unforeseen',
      description: `Faltou na devolução: ${description}`,
      amount: -difference,
      date: day,
      source: 'import',
    });
  }
  await repo.setReimbursed(month, expenseId, new Date().toISOString());
  await banks.settle(ids, 'reimbursed', expenseId, month);
}
