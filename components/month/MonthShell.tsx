'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CategoryKind, Expense, Income, Month } from '@/lib/budget';
import { useMonthData } from '@/lib/hooks/useMonthData';
import { setLastViewedMonth } from '@/lib/storage/preferences';
import { useSettings } from '@/components/providers/SettingsProvider';
import { MonthContext } from './MonthContext';
import { ExpenseFormSheet } from './ExpenseFormSheet';
import { IncomeFormSheet } from './IncomeFormSheet';

type ExpenseFormState =
  { open: true; initial?: Expense; defaultCategoryKind?: CategoryKind } | { open: false };
type IncomeFormState = { open: true; initial?: Income } | { open: false };

export function MonthShell({ month, children }: { month: Month; children: ReactNode }) {
  const monthData = useMonthData(month);
  const { settings } = useSettings();

  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({ open: false });
  const [incomeForm, setIncomeForm] = useState<IncomeFormState>({ open: false });

  useEffect(() => {
    setLastViewedMonth(month);
  }, [month]);

  const openExpenseForm = useCallback((initial?: Expense, defaultCategoryKind?: CategoryKind) => {
    setExpenseForm({ open: true, initial, defaultCategoryKind });
  }, []);
  const openIncomeForm = useCallback((initial?: Income) => {
    setIncomeForm({ open: true, initial });
  }, []);

  return (
    <MonthContext.Provider value={{ ...monthData, month, openExpenseForm, openIncomeForm }}>
      {children}

      {expenseForm.open && settings && (
        <ExpenseFormSheet
          month={month}
          topics={monthData.monthData?.topicsSnapshot ?? settings.topics}
          specialCategories={settings.specialCategories}
          initial={expenseForm.initial}
          defaultCategoryKind={expenseForm.defaultCategoryKind}
          onClose={() => setExpenseForm({ open: false })}
          onSave={monthData.saveExpense}
          onDelete={monthData.deleteExpense}
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
