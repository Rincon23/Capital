import type { BudgetSettings, MonthData } from '../budget/types';

/** The three things a new account does first: the "Primeiros passos" widget of the Início. */
export type FirstStep = 'income' | 'expense' | 'budget';

export const FIRST_STEPS: FirstStep[] = ['income', 'expense', 'budget'];

/**
 * Saved in the dismissed notices once the account went through "Como você quer usar o Capital?".
 * Only such a new account gets "Primeiros passos": the accounts from before it never see it.
 */
export const FIRST_STEPS_NOTICE = 'first-steps';

/** The notice that says a step is done. Saved, so a step stays done in the months after. */
export const firstStepNotice = (step: FirstStep) => `${FIRST_STEPS_NOTICE}:${step}`;

type NoticesSource = Pick<BudgetSettings, 'dismissedNotices'> | null | undefined;

const noticesOf = (source: NoticesSource) => source?.dismissedNotices ?? [];

/** Whether the account has "Primeiros passos": a new account that has not done all three yet. */
export function wantsFirstSteps(source: NoticesSource): boolean {
  const notices = noticesOf(source);
  return (
    notices.includes(FIRST_STEPS_NOTICE) && FIRST_STEPS.some((step) => !notices.includes(firstStepNotice(step)))
  );
}

/**
 * Which steps are done: the ones saved, plus what the month already shows (an income, an expense).
 * "Ver quanto ainda posso gastar" is done once the person opened Categorias, which saves it.
 */
export function firstStepsDone(
  source: NoticesSource,
  month: Pick<MonthData, 'incomes' | 'expenses'> | null | undefined,
): Record<FirstStep, boolean> {
  const notices = noticesOf(source);
  const saved = (step: FirstStep) => notices.includes(firstStepNotice(step));
  return {
    income: saved('income') || (month?.incomes.length ?? 0) > 0,
    expense: saved('expense') || (month?.expenses.length ?? 0) > 0,
    budget: saved('budget'),
  };
}

/** The notices to save for `steps` just done: none for an account without "Primeiros passos". */
export function firstStepNoticesToAdd(source: NoticesSource, steps: FirstStep[]): string[] {
  const notices = noticesOf(source);
  if (!notices.includes(FIRST_STEPS_NOTICE)) return [];
  return FIRST_STEPS.filter((step) => steps.includes(step))
    .map(firstStepNotice)
    .filter((notice) => !notices.includes(notice));
}
