'use client';

import { useMonthContext } from './MonthContext';
import { useToast } from '@/components/ui/Toast';

/** "Este mês está fechado" with "Reabrir", on the screens that write to the month. */
export function ClosedMonthBanner() {
  const { monthData, reopenMonth } = useMonthContext();
  const { showToast } = useToast();

  if (!monthData?.closed) return null;

  async function handleReopen() {
    try {
      await reopenMonth();
      showToast(
        monthData?.leftoversDropped
          ? 'Mês reaberto. Você já pode lançar de novo.'
          : 'Mês reaberto. A sobra voltou para ele.',
      );
    } catch {
      showToast('Não foi possível reabrir o mês. Tente de novo.', 'error');
    }
  }

  return (
    <div className="bg-warning-bg text-warning flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
      <span>
        {monthData.leftoversDropped
          ? 'Este mês está fechado. A sobra não foi para o seguinte.'
          : 'Este mês está fechado.'}
      </span>
      <button
        type="button"
        onClick={() => void handleReopen()}
        className="min-h-[36px] font-semibold underline"
      >
        Reabrir
      </button>
    </div>
  );
}
