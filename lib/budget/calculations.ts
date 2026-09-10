import { resolveTopicColor } from './colors';
import { round2, sum } from './money';
import type { Expense, MonthData, TopicConfig } from './types';

export interface TopicResult {
  topicId: string;
  name: string;
  targetPct: number;
  /** Hex color for this envelope (from config, or a palette default). */
  color: string;
  /** Money spent in this topic this month ("Valor Gasto"). */
  spent: number;
  /** Rollover from the previous month ("Mês passado"). */
  carryIn: number;
  /** This topic's share of fixed costs + unforeseen expenses ("Imprevistos e custos fixos"). */
  proportionalFixed: number;
  /** How much can still be spent in this topic this month ("Posso gastar"). */
  available: number;
  /** available - spent ("Sobra"). Becomes next month's carryIn. */
  remaining: number;
  /** spent / available, or null when available <= 0 ("Utilizada"). */
  usedPct: number | null;
}

export interface MonthSummary {
  month: string;
  incomeTotal: number;
  fixedTotal: number;
  unforeseenTotal: number;
  /** Sum of 'reimbursed' expenses — card purchases someone else pays back. Never touches the envelope math. */
  reimbursedTotal: number;
  /** Everything that will land on the credit-card bill: card purchases + all reimbursed expenses. */
  cardTotal: number;
  /** Total money spent across all topics plus fixed costs and unforeseen. Excludes reimbursed expenses. */
  expenseTotal: number;
  /** Sum of available(t) across all topics. */
  availableTotal: number;
  /** Sum of remaining(t) across all topics ("Saldo geral"). */
  balance: number;
  topics: TopicResult[];
}

export function computeIncomeTotal(monthData: Pick<MonthData, 'incomes'>): number {
  return sum(monthData.incomes.map((income) => income.amount));
}

export function computeFixedTotal(expenses: Expense[]): number {
  return sum(expenses.filter((e) => e.categoryKind === 'fixedCost').map((e) => e.amount));
}

export function computeUnforeseenTotal(expenses: Expense[]): number {
  return sum(expenses.filter((e) => e.categoryKind === 'unforeseen').map((e) => e.amount));
}

export function computeReimbursedTotal(expenses: Expense[]): number {
  return sum(expenses.filter((e) => e.categoryKind === 'reimbursed').map((e) => e.amount));
}

/**
 * Everything that will show up on the credit-card bill: any expense flagged as a
 * card purchase, plus every 'reimbursed' expense (which is a card purchase by
 * definition). Reimbursed amounts are counted once even if also flagged.
 */
export function computeCardTotal(expenses: Expense[]): number {
  return sum(
    expenses
      .filter((e) => e.categoryKind === 'reimbursed' || e.singleInstallmentCard === true)
      .map((e) => e.amount),
  );
}

/** Money spent in a topic this month. Reimbursed expenses never belong to a topic and are ignored. */
export function computeTopicSpent(expenses: Expense[], topicId: string): number {
  return sum(
    expenses.filter((e) => e.categoryKind === 'topic' && e.topicId === topicId).map((e) => e.amount),
  );
}

export function computeProportionalFixed(
  fixedTotal: number,
  unforeseenTotal: number,
  targetPct: number,
): number {
  return round2((fixedTotal + unforeseenTotal) * targetPct);
}

export function computeAvailable(
  incomeTotal: number,
  targetPct: number,
  proportionalFixed: number,
  carryIn: number,
): number {
  return round2(incomeTotal * targetPct - proportionalFixed + carryIn);
}

export function computeRemaining(available: number, spent: number): number {
  return round2(available - spent);
}

/** null represents the spreadsheet's "—" state, shown when available(t) <= 0. */
export function computeUsedPct(spent: number, available: number): number | null {
  if (available <= 0) return null;
  return spent / available;
}

export function computeTopicResult(
  topic: TopicConfig,
  expenses: Expense[],
  incomeTotal: number,
  fixedTotal: number,
  unforeseenTotal: number,
  carryIn: number,
  color: string,
): TopicResult {
  const spent = computeTopicSpent(expenses, topic.id);
  const proportionalFixed = computeProportionalFixed(fixedTotal, unforeseenTotal, topic.targetPct);
  const available = computeAvailable(incomeTotal, topic.targetPct, proportionalFixed, carryIn);
  const remaining = computeRemaining(available, spent);
  const usedPct = computeUsedPct(spent, available);

  return {
    topicId: topic.id,
    name: topic.name,
    targetPct: topic.targetPct,
    color,
    spent,
    carryIn,
    proportionalFixed,
    available,
    remaining,
    usedPct,
  };
}

/** Computes the full summary for a month from its raw data. Pure: no I/O, no React. */
export function computeMonthSummary(monthData: MonthData): MonthSummary {
  const activeTopics = monthData.topicsSnapshot.filter((t) => !t.archived);
  const incomeTotal = computeIncomeTotal(monthData);
  const fixedTotal = computeFixedTotal(monthData.expenses);
  const unforeseenTotal = computeUnforeseenTotal(monthData.expenses);
  const reimbursedTotal = computeReimbursedTotal(monthData.expenses);
  const cardTotal = computeCardTotal(monthData.expenses);

  const topics = activeTopics
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((topic, index) =>
      computeTopicResult(
        topic,
        monthData.expenses,
        incomeTotal,
        fixedTotal,
        unforeseenTotal,
        monthData.carryIn[topic.id] ?? 0,
        resolveTopicColor(topic, index),
      ),
    );

  const expenseTotal = round2(fixedTotal + unforeseenTotal + sum(topics.map((t) => t.spent)));
  const availableTotal = sum(topics.map((t) => t.available));
  const balance = sum(topics.map((t) => t.remaining));

  return {
    month: monthData.month,
    incomeTotal,
    fixedTotal,
    unforeseenTotal,
    reimbursedTotal,
    cardTotal,
    expenseTotal,
    availableTotal,
    balance,
    topics,
  };
}

export type ProgressState = 'ok' | 'warning' | 'danger';

/** Green < 80%, yellow 80-100%, red > 100% or available <= 0. */
export function computeProgressState(usedPct: number | null): ProgressState {
  if (usedPct === null) return 'danger';
  if (usedPct > 1) return 'danger';
  if (usedPct >= 0.8) return 'warning';
  return 'ok';
}
