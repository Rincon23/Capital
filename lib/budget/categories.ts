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
  fixedCost: 'Custo Fixo',
  unforeseen: 'Imprevistos',
  reimbursable: 'A receber',
};

/** Shown wherever the "A receber" category appears, so its behaviour is never a surprise. */
export const REIMBURSABLE_EXPLANATION =
  'Você pagou no cartão, mas alguém vai te devolver. Entra na fatura do cartão e não gasta nenhuma categoria.';

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
