'use client';

import { useMemo, useState } from 'react';
import {
  amountToInputValue,
  currentMonthKey,
  parseAmountInput,
  validateExpense,
  type CategoryKind,
  type Expense,
  type Month,
  type SpecialCategoryLabels,
  type TopicConfig,
} from '@/lib/budget';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';

function defaultDateForMonth(month: Month): string {
  const today = new Date();
  if (currentMonthKey(today) === month) return today.toISOString().slice(0, 10);
  return `${month}-01`;
}

interface ExpenseFormSheetProps {
  month: Month;
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  initial?: Expense;
  defaultCategoryKind?: CategoryKind;
  onClose: () => void;
  onSave: (expense: Expense) => Promise<void>;
  onDelete?: (expenseId: string) => Promise<void>;
}

export function ExpenseFormSheet({
  month,
  topics,
  specialCategories,
  initial,
  defaultCategoryKind,
  onClose,
  onSave,
  onDelete,
}: ExpenseFormSheetProps) {
  const activeTopics = useMemo(
    () => topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order),
    [topics],
  );

  const [amount, setAmount] = useState(initial ? amountToInputValue(initial.amount) : '');
  const [categoryKind, setCategoryKind] = useState<CategoryKind>(
    initial?.categoryKind ?? defaultCategoryKind ?? 'topic',
  );
  const [topicId, setTopicId] = useState<string | undefined>(initial?.topicId ?? activeTopics[0]?.id);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [date, setDate] = useState(initial?.date ?? defaultDateForMonth(month));
  const [singleInstallmentCard, setSingleInstallmentCard] = useState(initial?.singleInstallmentCard ?? false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const needsTopic = categoryKind === 'topic';
  const isReimbursed = categoryKind === 'reimbursed';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedAmount = parseAmountInput(amount);
    const result = validateExpense({ categoryKind, topicId, amount: parsedAmount, date });
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initial?.id ?? crypto.randomUUID(),
        categoryKind,
        topicId: needsTopic ? topicId : undefined,
        description: description.trim() || specialLabelFor(categoryKind, specialCategories),
        amount: parsedAmount,
        date,
        singleInstallmentCard: isReimbursed ? true : singleInstallmentCard,
      });
      onClose();
    } catch {
      setErrors(['Não foi possível salvar. Tente novamente.']);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(initial.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title={initial ? 'Editar gasto' : 'Lançar gasto'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AmountInput value={amount} onChange={setAmount} autoFocus={!initial} />

        <div>
          <p className="text-muted mb-2 text-sm font-medium">Categoria</p>
          <div className="flex flex-wrap gap-2">
            {activeTopics.map((topic) => (
              <Chip
                key={topic.id}
                label={topic.name}
                selected={categoryKind === 'topic' && topicId === topic.id}
                onClick={() => {
                  setCategoryKind('topic');
                  setTopicId(topic.id);
                }}
              />
            ))}
            <Chip
              label={specialCategories.fixedCost}
              selected={categoryKind === 'fixedCost'}
              onClick={() => setCategoryKind('fixedCost')}
            />
            <Chip
              label={specialCategories.unforeseen}
              selected={categoryKind === 'unforeseen'}
              onClick={() => setCategoryKind('unforeseen')}
            />
            <Chip
              label={specialCategories.reimbursed}
              selected={categoryKind === 'reimbursed'}
              onClick={() => setCategoryKind('reimbursed')}
            />
          </div>
        </div>

        {isReimbursed && (
          <p className="bg-card text-muted rounded-lg px-3 py-2 text-xs">
            Vai pra fatura do cartão, mas não entra no orçamento de nenhuma categoria. Use quando alguém for
            te devolver o valor depois.
          </p>
        )}

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Descrição
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Almoço, gasolina..."
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Data
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
          {!date.startsWith(month) && (
            <span className="text-warning text-xs">
              Essa data está fora de {month}. Tudo bem, é só um aviso.
            </span>
          )}
        </label>

        {!isReimbursed && (
          <label className="text-foreground flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={singleInstallmentCard}
              onChange={(e) => setSingleInstallmentCard(e.target.checked)}
              className="border-border h-5 w-5 rounded"
            />
            Cartão 1x?
          </label>
        )}

        {errors.length > 0 && (
          <ul className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 pt-1">
          {initial && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="border-danger text-danger min-h-[44px] rounded-lg border px-4 py-2 font-medium disabled:opacity-50"
            >
              Excluir
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-primary-foreground min-h-[44px] flex-1 rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

function specialLabelFor(kind: CategoryKind, labels: SpecialCategoryLabels): string {
  if (kind === 'fixedCost') return labels.fixedCost;
  if (kind === 'unforeseen') return labels.unforeseen;
  if (kind === 'reimbursed') return labels.reimbursed;
  return '';
}
