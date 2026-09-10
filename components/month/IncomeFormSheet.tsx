'use client';

import { useState } from 'react';
import {
  amountToInputValue,
  currentMonthKey,
  parseAmountInput,
  validatePositiveAmount,
  type Income,
  type Month,
} from '@/lib/budget';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';

function defaultDateForMonth(month: Month): string {
  const today = new Date();
  if (currentMonthKey(today) === month) return today.toISOString().slice(0, 10);
  return `${month}-01`;
}

interface IncomeFormSheetProps {
  month: Month;
  initial?: Income;
  onClose: () => void;
  onSave: (income: Income) => Promise<void>;
  onDelete?: (incomeId: string) => Promise<void>;
}

export function IncomeFormSheet({ month, initial, onClose, onSave, onDelete }: IncomeFormSheetProps) {
  const [amount, setAmount] = useState(initial ? amountToInputValue(initial.amount) : '');
  const [source, setSource] = useState(initial?.source ?? '');
  const [date, setDate] = useState(initial?.date ?? defaultDateForMonth(month));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsedAmount = parseAmountInput(amount);
    if (!validatePositiveAmount(parsedAmount)) {
      setError('O valor deve ser maior que zero.');
      return;
    }
    if (!source.trim()) {
      setError('Informe a fonte da renda.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initial?.id ?? crypto.randomUUID(),
        source: source.trim(),
        amount: parsedAmount,
        date,
      });
      onClose();
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
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
    <BottomSheet open onClose={onClose} title={initial ? 'Editar renda' : 'Nova renda'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AmountInput value={amount} onChange={setAmount} autoFocus={!initial} />

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Fonte
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Ex.: Salário, Freela..."
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
        </label>

        {error && <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">{error}</p>}

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
