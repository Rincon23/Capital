'use client';

import { useMemo, useState } from 'react';
import { Mic } from 'lucide-react';
import {
  amountToInputValue,
  currentMonthKey,
  parseAmountInput,
  resolveSpecialCategoryLabels,
  specialCategoryLabel,
  todayISO,
  validateExpense,
  type CategoryKind,
  type Expense,
  type ExpenseSource,
  type Month,
  type SpecialCategoryLabels,
  type TopicConfig,
} from '@/lib/budget';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CategoryPicker } from '@/components/ui/CategoryPicker';

function defaultDateForMonth(month: Month): string {
  const today = new Date();
  if (currentMonthKey(today) === month) return todayISO(today);
  return `${month}-01`;
}

interface ExpenseFormSheetProps {
  month: Month;
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  /** Whether the "A receber" module is on for this user. */
  reimbursableEnabled?: boolean;
  /** Whether the card module is on: without it the card question is not asked. */
  cardEnabled?: boolean;
  initial?: Expense;
  /** A new expense filled in ahead (what the voice entry understood), still to be checked. */
  draft?: Partial<Expense>;
  /** Overrides the sheet's title, e.g. when the form is confirming a recurring expense. */
  title?: string;
  defaultCategoryKind?: CategoryKind;
  /** False when the form is opened only to be shown (a tour step): no keyboard over it. */
  autoFocusAmount?: boolean;
  onClose: () => void;
  onSave: (expense: Expense) => Promise<void>;
  onDelete?: (expenseId: string) => Promise<void>;
  /** When given, a microphone in the header switches to "Lançar por voz ou texto". */
  onVoice?: () => void;
}

export function ExpenseFormSheet({
  month,
  topics,
  specialCategories,
  reimbursableEnabled = false,
  cardEnabled = true,
  initial,
  draft,
  title,
  defaultCategoryKind,
  autoFocusAmount = true,
  onClose,
  onSave,
  onDelete,
  onVoice,
}: ExpenseFormSheetProps) {
  const activeTopics = useMemo(
    () => topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order),
    [topics],
  );
  const labels = resolveSpecialCategoryLabels(specialCategories);
  // Turning the module off never hides an expense that is already "A receber": it stays
  // editable (and the user can move it to another category) instead of becoming unreachable.
  const showReimbursable = reimbursableEnabled || initial?.categoryKind === 'reimbursable';

  const prefill: Partial<Expense> | undefined = initial ?? draft;
  const source: ExpenseSource | undefined = initial ? initial.source : draft?.source;
  const [amount, setAmount] = useState(
    prefill?.amount !== undefined ? amountToInputValue(prefill.amount) : '',
  );
  const [categoryKind, setCategoryKind] = useState<CategoryKind>(
    prefill?.categoryKind ?? defaultCategoryKind ?? 'topic',
  );
  // A draft without a category leaves the choice to the user instead of picking the first one.
  const [topicId, setTopicId] = useState<string | undefined>(
    initial?.topicId ?? (draft ? draft.topicId : activeTopics[0]?.id),
  );
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [date, setDate] = useState(prefill?.date ?? defaultDateForMonth(month));
  const [singleInstallmentCard, setSingleInstallmentCard] = useState(prefill?.singleInstallmentCard ?? false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const needsTopic = categoryKind === 'topic';
  // "A receber" is by definition something paid on the card for someone else.
  const forcedCard = categoryKind === 'reimbursable';

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
        description: description.trim() || specialCategoryLabel(categoryKind, labels),
        amount: parsedAmount,
        date,
        // With the card module off, an expense keeps whatever it already had (nothing is unmarked).
        singleInstallmentCard:
          forcedCard || (cardEnabled ? singleInstallmentCard : (prefill?.singleInstallmentCard ?? false)),
        source,
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
    <BottomSheet
      open
      onClose={onClose}
      title={title ?? (initial ? 'Editar gasto' : draft ? 'Conferir gasto' : 'Lançar gasto')}
      headerAction={
        onVoice && !initial && !draft ? (
          <button
            type="button"
            onClick={onVoice}
            aria-label="Lançar por voz ou texto"
            className="text-primary hover:bg-background flex h-10 w-10 items-center justify-center rounded-full"
          >
            <Mic className="h-5 w-5" aria-hidden />
          </button>
        ) : undefined
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AmountInput value={amount} onChange={setAmount} autoFocus={autoFocusAmount && !prefill} />

        <CategoryPicker
          topics={topics}
          specialCategories={labels}
          value={{ categoryKind, topicId }}
          onChange={(next) => {
            setCategoryKind(next.categoryKind);
            setTopicId(next.topicId);
          }}
          showReimbursable={showReimbursable}
        />

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

        {cardEnabled && (
          <label className="text-foreground flex min-h-[44px] items-center gap-2 text-sm" data-tour="cartao-pergunta">
            <input
              type="checkbox"
              checked={forcedCard || singleInstallmentCard}
              disabled={forcedCard}
              onChange={(e) => setSingleInstallmentCard(e.target.checked)}
              className="border-border h-5 w-5 rounded disabled:opacity-60"
            />
            {forcedCard ? `${labels.reimbursable} é sempre no cartão` : 'A compra foi no cartão?'}
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
