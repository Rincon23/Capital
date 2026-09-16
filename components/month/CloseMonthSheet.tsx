'use client';

import { useState } from 'react';
import { formatBRL, formatMonthLabel, nextMonth, type MonthSummary } from '@/lib/budget';
import { BottomSheet } from '@/components/ui/BottomSheet';

interface CloseMonthSheetProps {
  summary: MonthSummary;
  /** Runs the close itself; resolves when the month is closed and the next one is open. */
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

/**
 * "Fechar mês" with the preview the bot never had: every envelope's leftover — including the
 * negative ones — exactly as it will land in the next month as "mês passado".
 */
export function CloseMonthSheet({ summary, onConfirm, onCancel }: CloseMonthSheetProps) {
  const [busy, setBusy] = useState(false);
  const next = nextMonth(summary.month);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open title={`Fechar ${formatMonthLabel(summary.month)}`} onClose={onCancel}>
      <div className="flex flex-col gap-5">
        <p className="text-muted text-sm leading-relaxed">
          Depois de fechado, este mês não aceita mais lançamentos (dá para reabrir). As sobras
          abaixo viram o &ldquo;mês passado&rdquo; de {formatMonthLabel(next)}, que será aberto
          para você.
        </p>

        <ul className="border-border divide-border divide-y rounded-xl border">
          {summary.topics.map((topic) => (
            <li key={topic.topicId} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="text-muted flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: topic.color }}
                />
                <span className="truncate">{topic.name}</span>
              </span>
              <span className={`font-semibold ${topic.remaining < 0 ? 'text-danger' : 'text-foreground'}`}>
                {formatBRL(topic.remaining)}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold">
            <span className="text-muted">Total</span>
            <span className={summary.balance < 0 ? 'text-danger' : 'text-foreground'}>
              {formatBRL(summary.balance)}
            </span>
          </li>
        </ul>

        {summary.topics.some((topic) => topic.remaining < 0) && (
          <p className="bg-warning-bg text-warning rounded-lg px-3 py-2 text-xs">
            As sobras negativas também são carregadas: no mês que vem essas categorias começam
            devendo.
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border-border text-foreground min-h-[44px] flex-1 rounded-lg border px-4 py-2 font-medium disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="bg-primary text-primary-foreground min-h-[44px] flex-1 rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
          >
            {busy ? 'Fechando…' : 'Fechar mês'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
