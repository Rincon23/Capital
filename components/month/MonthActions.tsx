'use client';

import { Mic } from 'lucide-react';
import type { CategoryKind } from '@/lib/budget';
import { Fab } from '@/components/ui/Fab';
import { useMonthContext } from './MonthContext';

/**
 * The floating "Renda" and "Lançar gasto" buttons (and the microphone, with the voice module on).
 * Screens that show them leave room at the bottom (`MONTH_ACTIONS_PADDING`).
 */
export function MonthActions({ defaultCategoryKind }: { defaultCategoryKind?: CategoryKind }) {
  const { openExpenseForm, openIncomeForm, openVoiceEntry } = useMonthContext();

  return (
    <div className="fixed right-4 bottom-20 z-30 flex flex-col items-end gap-2">
      <Fab label="Renda" variant="secondary" onClick={() => openIncomeForm()} tourId="fab-renda" />
      <div className="flex items-center gap-2">
        {openVoiceEntry && (
          <button
            type="button"
            onClick={openVoiceEntry}
            aria-label="Lançar por voz ou texto"
            data-tour="fab-voz"
            className="border-border bg-card text-primary flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition-transform active:scale-95"
          >
            <Mic className="h-5 w-5" aria-hidden />
          </button>
        )}
        <Fab
          label="Lançar gasto"
          onClick={() => openExpenseForm(undefined, defaultCategoryKind)}
          tourId="fab-lancar-gasto"
        />
      </div>
    </div>
  );
}

/** Bottom space for a screen with `MonthActions`, so the last item is never under the buttons. */
export const MONTH_ACTIONS_PADDING = 'pb-40';
