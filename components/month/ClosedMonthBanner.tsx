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
      showToast('Mês reaberto. Você já pode lançar de novo.');
    } catch {
      showToast('Não foi possível reabrir o mês. Tente novamente em alguns instantes.', 'error');
    }
  }

  return (
    <div className="bg-warning-bg text-warning flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
      <span>Este mês está fechado.</span>
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
