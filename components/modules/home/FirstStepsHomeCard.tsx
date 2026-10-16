'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, ListChecks } from 'lucide-react';
import { FIRST_STEPS, firstStepsDone, type FirstStep } from '@/lib/modules';
import { useMonthContext } from '@/components/month/MonthContext';
import { useSettings } from '@/components/providers/SettingsProvider';
import { IconTile } from '@/components/ui/IconTile';
import { useMarkFirstSteps } from '../useFirstSteps';

const LABELS: Record<FirstStep, string> = {
  income: 'Registrar a renda',
  expense: 'Lançar o primeiro gasto',
  budget: 'Ver quanto ainda posso gastar',
};

/**
 * "Primeiros passos", at the top of a new account's Início: register the income, log the first
 * expense and see how much is left to spend. Each step is a button that opens the right place, and
 * marks itself once done (an income or an expense in the month, Categorias opened). The widget
 * leaves the Início when the three are done; like any widget, its "−" takes it off earlier.
 */
export function FirstStepsHomeCard() {
  const { month, monthData, openIncomeForm, openExpenseForm } = useMonthContext();
  const { settings } = useSettings();
  const router = useRouter();
  const mark = useMarkFirstSteps();
  const done = firstStepsDone(settings, monthData);

  // What the month already shows is saved, so it stays done in the months after.
  const seen = FIRST_STEPS.filter((step) => step !== 'budget' && done[step]).join(',');
  useEffect(() => {
    if (seen) mark(seen.split(',') as FirstStep[]);
  }, [mark, seen]);

  const open: Record<FirstStep, () => void> = {
    income: () => openIncomeForm(),
    expense: () => openExpenseForm(),
    budget: () => router.push(`/mes/${month}/categorias`),
  };
  const next = FIRST_STEPS.find((step) => !done[step]);
  const count = FIRST_STEPS.filter((step) => done[step]).length;

  return (
    <section
      className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
      aria-labelledby="primeiros-passos"
    >
      <div className="flex items-center gap-3">
        <IconTile icon={ListChecks} tone="green" />
        <p id="primeiros-passos" className="text-foreground min-w-0 flex-1 truncate font-semibold">
          Primeiros passos
        </p>
        <span className="text-muted shrink-0 text-xs font-medium tabular-nums">
          {count} de {FIRST_STEPS.length}
        </span>
      </div>
      <ol className="flex flex-col gap-1">
        {FIRST_STEPS.map((step, index) => {
          const isDone = done[step];
          const isNext = step === next;
          return (
            <li key={step}>
              <button
                type="button"
                onClick={open[step]}
                aria-label={isDone ? `${LABELS[step]} (feito)` : LABELS[step]}
                className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors ${
                  isNext ? 'bg-primary/10 text-foreground font-semibold' : 'text-foreground hover:bg-background'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isDone
                      ? 'bg-success-fill text-white'
                      : isNext
                        ? 'bg-primary text-primary-foreground'
                        : 'border-border text-muted border'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
                </span>
                <span className={`min-w-0 flex-1 ${isDone ? 'text-muted line-through' : ''}`}>
                  {LABELS[step]}
                </span>
                {!isDone && <ChevronRight aria-hidden className="text-muted h-4 w-4 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
