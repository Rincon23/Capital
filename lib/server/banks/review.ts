import 'server-only';
import { categoryOptions } from '@/lib/ai';
import {
  findDuplicate,
  findDuplicateIncome,
  findReimbursement,
  groupInstallments,
  IGNORE_LABELS,
  ignoreReason,
  matchingPlan,
  memoryKey,
  reviewKind,
  suggestCategory,
  type BankReview,
  type CategoryChoice,
  type LaunchedExpense,
  type ReviewItem,
} from '@/lib/banks';
import { nextMonth, presetOf, previousMonth } from '@/lib/budget';
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
    const payback = kind === 'income' && !reason ? findReimbursement(base, pendingBack, taken) : null;
    if (payback) {
      // One "A receber" is offered to one Pix at most.
      taken.add(payback.expense.id);
      base.reimbursement = {
        month: payback.month,
        expenseId: payback.expense.id,
        description: payback.expense.description,
        amount: payback.expense.amount,
      };
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
        // The same "Já me pagou" as the A receber screen (`setReimbursed`), on the day it arrived.
        await repo.setReimbursed(input.month, input.expenseId, new Date().toISOString());
        await banks.settle(ids, 'reimbursed', input.expenseId, input.month);
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
