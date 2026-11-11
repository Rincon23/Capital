import type { MonthSummary } from './calculations';
import { specialCategoryLabel } from './categories';
import { formatMonthShort } from './date';
import { formatBRL } from './money';
import type { Expense, Month, SpecialCategoryLabels } from './types';

/**
 * What a new expense did to the budget, in one line for the toast that follows saving it — the
 * way a person learns the category by using it: "R$ 45,00 em Metas · ainda dá R$ 320,00 este
 * mês", or "passou R$ 30,00 do limite". Fixed and unforeseen costs are split across the categories,
 * so they say just that — never what is left in all of them together, a total that reads as if
 * the whole of it could go to anything; "Reembolso" and "Fora do orçamento" touch none.
 * `summary` is the month as it was just before the expense (null without the budget module), or
 * already with it when `counted`. `investingTopicId` is the Investimentos category: money sent to
 * it is set aside, so what is left there is "falta investir", never "ainda dá".
 */
export function expenseFeedback({
  expense,
  summary,
  counted = false,
  labels,
  month,
  currentMonth,
  investingTopicId,
}: {
  expense: Pick<Expense, 'categoryKind' | 'topicId' | 'amount'>;
  summary: MonthSummary | null;
  counted?: boolean;
  labels: SpecialCategoryLabels;
  month: Month;
  currentMonth: Month;
  investingTopicId?: string;
}): string {
  const amount = formatBRL(expense.amount);
  const spent = counted ? 0 : expense.amount;
  const when = month === currentMonth ? 'este mês' : `em ${formatMonthShort(month)}`;
  const left = (remaining: number, overText: string) =>
    remaining >= 0 ? `ainda dá ${formatBRL(remaining)} ${when}` : `passou ${formatBRL(-remaining)} ${overText}`;

  if (expense.categoryKind === 'reimbursable') {
    return `${amount} em ${specialCategoryLabel('reimbursable', labels)} · não mexe nas categorias`;
  }
  if (expense.categoryKind === 'uncounted') return `${amount} fora do orçamento`;
  if (!summary) return `Gasto de ${amount} salvo.`;

  if (expense.categoryKind === 'topic') {
    const topic = summary.topics.find((item) => item.topicId === expense.topicId);
    if (!topic) return `Gasto de ${amount} salvo.`;
    const remaining = topic.remaining - spent;
    if (topic.topicId === investingTopicId && remaining >= 0) {
      return `${amount} em ${topic.name} · falta investir ${formatBRL(remaining)} ${when}`;
    }
    return `${amount} em ${topic.name} · ${left(remaining, 'do limite')}`;
  }
  const label = specialCategoryLabel(expense.categoryKind, labels);
  return `${amount} em ${label} · dividido entre as categorias`;
}
