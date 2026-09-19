'use client';

import { useState } from 'react';
import {
  amountToInputValue,
  monthsTouchedBy,
  parseAmountInput,
  resolveSpecialCategoryLabels,
  todayISO,
  type CreditCard,
  type InstallmentAccounting,
  type InstallmentPlan,
  type Month,
  type SpecialCategoryLabels,
  type TopicConfig,
} from '@/lib/budget';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CardPicker } from '@/components/ui/CardPicker';
import { CategoryPicker, type CategoryValue } from '@/components/ui/CategoryPicker';
import { ClosedMonthsNotice, closedMonthsOf } from './ClosedMonthsNotice';
import { InstallmentOptions, MAX_INSTALLMENTS } from './InstallmentOptions';

const INPUT =
  'border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2';

/**
 * The whole purchase: what it was, how much it cost, in how many times, on which card, in which
 * category and how it enters the budget. Saving it rebuilds every month of the series, which is
 * what makes changing the mode (or the category, or the card) move the money — and what undoes
 * an adjustment made to a single instalment by hand.
 */
export function InstallmentFormSheet({
  plan,
  topics,
  specialCategories,
  showReimbursable,
  cards,
  closedMonths,
  onClose,
  onSave,
  onDelete,
}: {
  plan: InstallmentPlan;
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  showReimbursable: boolean;
  cards: CreditCard[];
  closedMonths: Month[];
  onClose: () => void;
  onSave: (plan: InstallmentPlan) => Promise<void>;
  onDelete: (plan: InstallmentPlan) => Promise<void>;
}) {
  const labels = resolveSpecialCategoryLabels(specialCategories);
  const activeTopics = topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order);
  const [name, setName] = useState(plan.name);
  const [total, setTotal] = useState(amountToInputValue(plan.totalAmount));
  const [purchaseDate, setPurchaseDate] = useState(plan.purchaseDate ?? plan.firstDebitDate);
  const [cardId, setCardId] = useState<string | undefined>(plan.cardId);
  const [category, setCategory] = useState<CategoryValue>({
    categoryKind: plan.categoryKind,
    topicId: plan.topicId ?? activeTopics[0]?.id,
  });
  const [installment, setInstallment] = useState({
    count: String(plan.count),
    firstDebitDate: plan.firstDebitDate,
    accounting: plan.accounting as InstallmentAccounting,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [closed, setClosed] = useState<Month[] | null>(null);
  const [saving, setSaving] = useState(false);

  const parsedTotal = parseAmountInput(total);
  const count = Number.parseInt(installment.count, 10);
  const categoryLabel =
    category.categoryKind === 'topic'
      ? (activeTopics.find((t) => t.id === category.topicId)?.name ?? 'a categoria')
      : category.categoryKind === 'fixedCost'
        ? labels.fixedCost
        : category.categoryKind === 'unforeseen'
          ? labels.unforeseen
          : labels.reimbursable;

  function build(): InstallmentPlan {
    return {
      id: plan.id,
      name: name.trim(),
      categoryKind: category.categoryKind,
      ...(category.categoryKind === 'topic' && category.topicId ? { topicId: category.topicId } : {}),
      firstDebitDate: installment.firstDebitDate,
      purchaseDate,
      count,
      totalAmount: parsedTotal,
      accounting: installment.accounting,
      ...(cardId ? { cardId } : {}),
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problems: string[] = [];
    if (!name.trim()) problems.push('Escreva o nome da compra.');
    if (!(parsedTotal > 0)) problems.push('O valor total deve ser maior que zero.');
    if (!(count >= 2 && count <= MAX_INSTALLMENTS)) {
      problems.push(`O número de parcelas vai de 2 a ${MAX_INSTALLMENTS}.`);
    }
    if (category.categoryKind === 'topic' && !category.topicId) problems.push('Selecione uma categoria.');
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    const blocked = monthsTouchedBy(build()).filter((month) => closedMonths.includes(month));
    if (blocked.length > 0) {
      setClosed(blocked);
      return;
    }

    setSaving(true);
    setClosed(null);
    try {
      await onSave(build());
      onClose();
    } catch (err) {
      const fromServer = closedMonthsOf(err);
      if (fromServer) setClosed(fromServer);
      else setErrors([err instanceof Error ? err.message : 'Não foi possível salvar. Tente novamente.']);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const blocked = monthsTouchedBy(plan).filter((month) => closedMonths.includes(month));
    if (blocked.length > 0) {
      setClosed(blocked);
      return;
    }
    setSaving(true);
    setClosed(null);
    try {
      await onDelete(plan);
      onClose();
    } catch (err) {
      const fromServer = closedMonthsOf(err);
      if (fromServer) setClosed(fromServer);
      else setErrors([err instanceof Error ? err.message : 'Não foi possível excluir. Tente novamente.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open title="Editar a compra" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AmountInput value={total} onChange={setTotal} label="Valor total da compra" />

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Nome da compra
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Notebook, faculdade..."
            className={INPUT}
          />
        </label>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Data da compra
          <input
            type="date"
            value={purchaseDate}
            onChange={(event) => setPurchaseDate(event.target.value)}
            className={INPUT}
          />
        </label>

        <CategoryPicker
          topics={topics}
          specialCategories={labels}
          value={category}
          onChange={setCategory}
          showReimbursable={showReimbursable}
        />

        <CardPicker cards={cards} value={cardId} onChange={setCardId} />

        <InstallmentOptions
          value={installment}
          onChange={setInstallment}
          totalAmount={parsedTotal}
          categoryLabel={categoryLabel}
          purchaseMonth={(purchaseDate || todayISO()).slice(0, 7)}
        />

        <p className="text-muted text-xs">
          Salvar refaz os meses desta compra: se você tinha ajustado uma parcela na mão, ela volta
          ao valor do parcelamento.
        </p>

        {closed && <ClosedMonthsNotice months={closed} onNavigate={onClose} />}

        {errors.length > 0 && (
          <ul className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">
            {errors.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving}
            className="border-danger text-danger min-h-[44px] rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
          >
            Excluir
          </button>
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
