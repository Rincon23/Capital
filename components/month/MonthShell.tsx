'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  currentMonthKey,
  isModuleOn,
  withCurrentTopicDisplay,
  type CategoryKind,
  type Expense,
  type Income,
  type Month,
} from '@/lib/budget';
import { useMonthData } from '@/lib/hooks/useMonthData';
import { setLastViewedMonth } from '@/lib/storage/preferences';
import { useSettings } from '@/components/providers/SettingsProvider';
import { VoiceEntrySheet } from '@/components/voice/VoiceEntrySheet';
import { MonthContext } from './MonthContext';
import { ExpenseFormSheet } from './ExpenseFormSheet';
import { IncomeFormSheet } from './IncomeFormSheet';

type ExpenseFormState =
  | { open: true; initial?: Expense; draft?: Partial<Expense>; defaultCategoryKind?: CategoryKind }
  | { open: false };
type IncomeFormState = { open: true; initial?: Income } | { open: false };

export function MonthShell({ month, children }: { month: Month; children: ReactNode }) {
  const { settings } = useSettings();
  const monthData = useMonthData(month, settings?.topics);

  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({ open: false });
  const [incomeForm, setIncomeForm] = useState<IncomeFormState>({ open: false });
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    setLastViewedMonth(month);
  }, [month]);

  const openExpenseForm = useCallback((initial?: Expense, defaultCategoryKind?: CategoryKind) => {
    setExpenseForm({ open: true, initial, defaultCategoryKind });
  }, []);
  const openIncomeForm = useCallback((initial?: Income) => {
    setIncomeForm({ open: true, initial });
  }, []);
  const voiceAvailable = isModuleOn(settings, 'voice');
  const openVoiceEntry = useCallback(() => {
    setExpenseForm({ open: false });
    setVoiceOpen(true);
  }, []);

  // A hard storage failure (e.g. the server or its database unreachable) leaves monthData
  // null forever; show the error instead of letting every child spin on "Carregando…".
  if (monthData.error && !monthData.monthData) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-foreground text-sm font-medium">Não foi possível carregar este mês</p>
        <p className="text-muted text-sm">{monthData.error}</p>
        <button
          type="button"
          onClick={() => void monthData.refresh()}
          disabled={monthData.loading}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 font-semibold disabled:opacity-50"
        >
          {monthData.loading ? 'Tentando…' : 'Tentar novamente'}
        </button>
      </div>
    );
  }

  return (
    <MonthContext.Provider
      value={{
        ...monthData,
        month,
        openExpenseForm,
        openIncomeForm,
        openVoiceEntry: voiceAvailable ? openVoiceEntry : undefined,
      }}
    >
      {children}

      {expenseForm.open && settings && (
        <ExpenseFormSheet
          month={month}
          topics={
            monthData.monthData
              ? withCurrentTopicDisplay(
                  monthData.monthData.topicsSnapshot,
                  settings.topics,
                  month >= currentMonthKey(),
                )
              : settings.topics
          }
          specialCategories={settings.specialCategories}
          reimbursableEnabled={isModuleOn(settings, 'reimbursable')}
          initial={expenseForm.initial}
          draft={expenseForm.draft}
          defaultCategoryKind={expenseForm.defaultCategoryKind}
          onClose={() => setExpenseForm({ open: false })}
          onSave={monthData.saveExpense}
          onDelete={monthData.deleteExpense}
          onVoice={voiceAvailable ? openVoiceEntry : undefined}
        />
      )}

      {voiceOpen && settings && (
        <VoiceEntrySheet
          month={month}
          settings={settings}
          onClose={() => setVoiceOpen(false)}
          onSave={monthData.saveExpense}
          onEdit={(draft) => {
            setVoiceOpen(false);
            setExpenseForm({ open: true, draft });
          }}
        />
      )}

      {incomeForm.open && (
        <IncomeFormSheet
          month={month}
          initial={incomeForm.initial}
          onClose={() => setIncomeForm({ open: false })}
          onSave={monthData.saveIncome}
          onDelete={monthData.deleteIncome}
        />
      )}
    </MonthContext.Provider>
  );
}
