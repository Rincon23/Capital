'use client';

import type { ReactNode } from 'react';
import { Pencil, Sparkles } from 'lucide-react';
import {
  formatBRL,
  formatMonthLabel,
  resolveSpecialCategoryColors,
  resolveSpecialCategoryLabels,
  resolveTopicColor,
  type BudgetSettings,
  type Month,
} from '@/lib/budget';
import type { DraftField, ExpenseDraftResult } from '@/lib/ai';
import { formatFullDate } from '@/lib/reminders/time';

/**
 * "Confira o gasto": what the AI understood, field by field, before anything is saved. The
 * pencil (or tapping any line) opens the expense form with everything filled in.
 */
export function DraftReview({
  result,
  month,
  settings,
  kind,
  onEdit,
}: {
  result: ExpenseDraftResult;
  month: Month;
  settings: Pick<BudgetSettings, 'topics' | 'specialCategories' | 'specialCategoryColors'>;
  kind: 'audio' | 'text';
  onEdit: () => void;
}) {
  const { draft, warnings, aiFields, transcript } = result;
  const labels = resolveSpecialCategoryLabels(settings.specialCategories);
  const colors = resolveSpecialCategoryColors(settings);

  let categoryLabel: string | undefined;
  let categoryColor: string | undefined;
  if (draft.categoryKind === 'topic') {
    const sorted = [...settings.topics].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((topic) => topic.id === draft.topicId);
    if (index >= 0) {
      categoryLabel = sorted[index].name;
      categoryColor = resolveTopicColor(sorted[index], index);
    }
  } else if (draft.categoryKind) {
    categoryLabel = labels[draft.categoryKind];
    categoryColor = colors[draft.categoryKind];
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border overflow-hidden rounded-xl border">
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <p className="text-muted text-sm">Algo errado? Toque para alterar.</p>
          <button
            type="button"
            onClick={onEdit}
            className="text-primary hover:bg-background -mr-2 flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Alterar
          </button>
        </div>
        <div className="divide-border divide-y">
          <Row label="Categoria" field="category" aiFields={aiFields} onEdit={onEdit}>
            {categoryLabel ? (
              <span className="flex items-center justify-end gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor }}
                  aria-hidden
                />
                {categoryLabel}
              </span>
            ) : (
              <Missing>Escolher</Missing>
            )}
          </Row>
          <Row label="Descrição" field="description" aiFields={aiFields} onEdit={onEdit}>
            {draft.description || <span className="text-muted">Sem descrição</span>}
          </Row>
          <Row label="Valor" field="amount" aiFields={aiFields} onEdit={onEdit}>
            {draft.amount !== undefined ? (
              <span className="tabular-nums">{formatBRL(draft.amount)}</span>
            ) : (
              <Missing>Preencher</Missing>
            )}
          </Row>
          <Row label="Data" field="date" aiFields={aiFields} onEdit={onEdit}>
            {formatFullDate(draft.date)}
            {!draft.date.startsWith(month) && (
              <span className="text-warning block text-xs font-normal">
                fora de {formatMonthLabel(month)}
              </span>
            )}
          </Row>
          <Row label="Cartão" field="card" aiFields={aiFields} onEdit={onEdit}>
            {draft.card ? 'Sim, no crédito' : 'Não'}
          </Row>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="bg-warning-bg text-warning flex flex-col gap-1 rounded-lg px-3 py-2 text-sm">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <p className="text-muted text-sm">
        {kind === 'audio' ? 'Você disse' : 'Você escreveu'}:{' '}
        <span className="text-foreground">“{transcript}”</span>
      </p>
      {aiFields.length > 0 && (
        <p className="text-muted -mt-2 flex items-center gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Campos com este ícone vieram da IA; o resto saiu direto das suas palavras.
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  field,
  aiFields,
  onEdit,
  children,
}: {
  label: string;
  field: DraftField;
  aiFields: DraftField[];
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="hover:bg-background flex min-h-[48px] w-full items-center justify-between gap-4 px-4 py-2 text-left"
    >
      <span className="text-muted flex shrink-0 items-center gap-1.5 text-sm">
        {label}
        {aiFields.includes(field) && <Sparkles className="h-3.5 w-3.5" aria-label="preenchido pela IA" />}
      </span>
      <span className="text-foreground min-w-0 text-right text-sm font-medium break-words">{children}</span>
    </button>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-warning font-semibold">{children}</span>;
}
