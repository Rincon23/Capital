'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMonthName } from '@/lib/budget';
import type { MonthToClose } from '@/lib/hooks/useMonthToClose';
import { useToast } from '@/components/ui/Toast';
import { CloseMonthSheet, closedMonthMessage } from './CloseMonthSheet';
import { useMonthContext } from './MonthContext';

/**
 * "Fechar outubro": what shows on the Gastos por categoria widget and screen once the month turned
 * (`useMonthToClose`). The answer lands on the month on screen, which is today's. The sheet goes to
 * the body: inside the telas of the Início, the track that slides them would carry it along.
 */
export function CloseLastMonthButton({ summary, close }: MonthToClose) {
  const { month, refresh } = useMonthContext();
  const { showToast } = useToast();
  const [closing, setClosing] = useState(false);

  async function handleConfirm(bringLeftovers: boolean) {
    try {
      await close(bringLeftovers);
      showToast(closedMonthMessage(summary, month, bringLeftovers));
      await refresh();
    } catch {
      showToast('Não foi possível fechar o mês. Tente de novo.', 'error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setClosing(true)}
        className="bg-primary text-primary-foreground min-h-[44px] w-full rounded-lg px-4 py-2 font-semibold"
      >
        Fechar {formatMonthName(summary.month).toLowerCase()}
      </button>

      {closing &&
        createPortal(
          <CloseMonthSheet
            summary={summary}
            target={month}
            onConfirm={handleConfirm}
            onCancel={() => {
              setClosing(false);
              showToast('Fechamento cancelado. Nenhuma alteração foi feita.', 'info');
            }}
          />,
          document.body,
        )}
    </>
  );
}
