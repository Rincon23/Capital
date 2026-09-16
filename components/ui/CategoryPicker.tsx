'use client';

import { useMemo } from 'react';
import {
  REIMBURSABLE_EXPLANATION,
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
}: {
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  value: CategoryValue;
  onChange: (value: CategoryValue) => void;
  showReimbursable?: boolean;
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
            selected={value.categoryKind === 'reimbursable'}
            onClick={() => onChange({ categoryKind: 'reimbursable', topicId: value.topicId })}
          />
        )}
      </div>
      {value.categoryKind === 'reimbursable' && (
        <p className="text-muted mt-2 text-xs">{REIMBURSABLE_EXPLANATION}</p>
      )}
    </div>
  );
}
