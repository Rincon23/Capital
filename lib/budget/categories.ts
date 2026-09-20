import type {
  BudgetSettings,
  CategoryKind,
  ResolvedSpecialCategoryLabels,
  SpecialCategoryLabels,
} from './types';

/**
 * Default labels for the special (non-envelope) categories. "A receber" is the user-facing
 * name of what the old Telegram bot called "Ressarcido" — that name never shows in the app.
 */
export const DEFAULT_SPECIAL_CATEGORY_LABELS: ResolvedSpecialCategoryLabels = {
  fixedCost: 'Custos Fixos',
  unforeseen: 'Imprevistos',
  reimbursable: 'A receber',
  uncounted: 'Fora do orçamento',
};

/** Shown wherever the "A receber" category appears, so its behaviour is never a surprise. */
export const REIMBURSABLE_EXPLANATION =
  'Você pagou, mas alguém vai te devolver. Não gasta nenhuma categoria — e, se foi no cartão, entra na fatura do mesmo jeito.';

/**
 * Shown wherever "Fora do orçamento" appears. The category exists because sometimes there is no
 * honest category for a gasto, but it is the one choice the app argues against: o dinheiro sai
 * do mesmo jeito e o orçamento do mês fica parecendo melhor do que é.
 */
export const UNCOUNTED_EXPLANATION =
  'O gasto fica registrado (e entra na fatura, se foi no cartão), mas não consome nenhuma categoria e não aparece no total gasto do mês.';

/** Why the app marks "Fora do orçamento" as "Não recomendado" wherever it is offered. */
export const UNCOUNTED_ADVICE =
  'Não recomendado: o dinheiro saiu do mesmo jeito, e nenhuma categoria vai mostrar isso.';

/** Special-category labels with any missing entry (older data) filled from the defaults. */
export function resolveSpecialCategoryLabels(
  source: Pick<BudgetSettings, 'specialCategories'> | SpecialCategoryLabels | undefined,
): ResolvedSpecialCategoryLabels {
  const labels =
    source && 'specialCategories' in source ? source.specialCategories : source;
  return { ...DEFAULT_SPECIAL_CATEGORY_LABELS, ...labels };
}

/** The label for a non-envelope category; '' for 'topic', which is named by its own envelope. */
export function specialCategoryLabel(
  kind: CategoryKind,
  labels: SpecialCategoryLabels | undefined,
): string {
  if (kind === 'topic') return '';
  return resolveSpecialCategoryLabels(labels)[kind];
}
