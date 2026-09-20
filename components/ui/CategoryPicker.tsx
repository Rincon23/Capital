'use client';

import { useMemo } from 'react';
import {
  REIMBURSABLE_EXPLANATION,
  UNCOUNTED_ADVICE,
  UNCOUNTED_EXPLANATION,
  resolveSpecialCategoryLabels,
  type CategoryKind,
  type SpecialCategoryLabels,
  type TopicConfig,
} from '@/lib/budget';
import { Chip } from './Chip';

export interface CategoryValue {
  categoryKind: CategoryKind;
  topicId?: string;
}

/**
 * The category of an expense: one chip per active envelope, plus the special categories.
 * Shared by the expense form and by the Carteira forms (recurring templates, instalment plans),
 * so a category means the same thing and looks the same everywhere.
 */
export function CategoryPicker({
  topics,
  specialCategories,
  value,
  onChange,
  showReimbursable = false,
  showUncounted = true,
}: {
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  value: CategoryValue;
  onChange: (value: CategoryValue) => void;
  showReimbursable?: boolean;
  /**
   * Whether to offer "Fora do orçamento" — the escape hatch for a gasto that should consume no
   * category. It is offered wherever an expense is filed, and always marked "Não recomendado".
   */
  showUncounted?: boolean;
}) {
  const activeTopics = useMemo(
    () => topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order),
    [topics],
  );
  const labels = resolveSpecialCategoryLabels(specialCategories);

  return (
    <div>
      <p className="text-muted mb-2 text-sm font-medium">Categoria</p>
      <div className="flex flex-wrap gap-2">
        {activeTopics.map((topic) => (
          <Chip
            key={topic.id}
            label={topic.name}
            selected={value.categoryKind === 'topic' && value.topicId === topic.id}
            onClick={() => onChange({ categoryKind: 'topic', topicId: topic.id })}
          />
        ))}
        <Chip
          label={labels.fixedCost}
          selected={value.categoryKind === 'fixedCost'}
          onClick={() => onChange({ categoryKind: 'fixedCost', topicId: value.topicId })}
        />
        <Chip
          label={labels.unforeseen}
          selected={value.categoryKind === 'unforeseen'}
          onClick={() => onChange({ categoryKind: 'unforeseen', topicId: value.topicId })}
        />
        {showReimbursable && (
          <Chip
            label={labels.reimbursable}
            tourAnchor="categoria-a-receber"
            selected={value.categoryKind === 'reimbursable'}
            onClick={() => onChange({ categoryKind: 'reimbursable', topicId: value.topicId })}
          />
        )}
        {showUncounted && (
          <Chip
            label={labels.uncounted}
            badge="Não recomendado"
            tourAnchor="categoria-fora-do-orcamento"
            selected={value.categoryKind === 'uncounted'}
            onClick={() => onChange({ categoryKind: 'uncounted', topicId: value.topicId })}
          />
        )}
      </div>
      {value.categoryKind === 'reimbursable' && (
        <p className="text-muted mt-2 text-xs">{REIMBURSABLE_EXPLANATION}</p>
      )}
      {value.categoryKind === 'uncounted' && (
        <div className="bg-warning-bg mt-2 flex flex-col gap-1 rounded-lg px-3 py-2">
          <p className="text-warning text-xs font-semibold">{UNCOUNTED_ADVICE}</p>
          <p className="text-muted text-xs">{UNCOUNTED_EXPLANATION}</p>
        </div>
      )}
    </div>
  );
}
