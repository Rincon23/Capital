import type { ModelReading } from './prompt';
import type { RuleReading } from './rules';
import type { DraftField, ExpenseDraft, ExpenseDraftResult } from './types';

/**
 * What the AI still has to answer after the rules: always the description, plus the category
 * or the value when the text didn't settle them. The date and the card always have an answer.
 */
export function fieldsForModel(reading: RuleReading): DraftField[] {
  const fields: DraftField[] = [];
  if (!reading.category.option) fields.push('category');
  fields.push('description');
  if (reading.amount === undefined) fields.push('amount');
  return fields;
}

export const DRAFT_WARNINGS = {
  noCategory: 'Não reconheci a categoria. Toque no lápis e escolha uma.',
  noAmount: 'Não entendi o valor. Toque no lápis e preencha.',
  aiOffline: 'A IA do servidor não respondeu, então a descrição saiu das próprias palavras. Confira.',
} as const;

/**
 * The draft shown for review: the rules' reading, completed by the AI's answer (`model`,
 * null when it failed). Anything still missing becomes a warning instead of a guess.
 */
export function buildDraftResult(
  transcript: string,
  reading: RuleReading,
  model: ModelReading | null,
): ExpenseDraftResult {
  const aiFields: DraftField[] = [];
  const warnings: string[] = [];

  const category = reading.category.option ?? model?.category;
  if (!reading.category.option && model?.category) aiFields.push('category');

  const amount = reading.amount ?? model?.amount;
  if (reading.amount === undefined && model?.amount !== undefined) aiFields.push('amount');

  let description = model?.description;
  if (description) aiFields.push('description');
  else description = reading.fallbackDescription;

  const draft: ExpenseDraft = {
    categoryKind: category?.categoryKind,
    topicId: category?.topicId,
    description,
    amount,
    date: reading.date,
    // "A receber" is always a card purchase (see the expense form).
    card: category?.categoryKind === 'reimbursable' ? true : reading.card,
  };

  if (!category) warnings.push(DRAFT_WARNINGS.noCategory);
  if (amount === undefined) warnings.push(DRAFT_WARNINGS.noAmount);
  if (model === null) warnings.push(DRAFT_WARNINGS.aiOffline);

  return { draft, transcript, warnings, aiFields };
}
