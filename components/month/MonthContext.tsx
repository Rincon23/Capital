'use client';

import { createContext, useContext } from 'react';
import type { UseMonthDataResult } from '@/lib/hooks/useMonthData';
import type { CategoryKind, Expense, Income, Month } from '@/lib/budget';

export interface MonthContextValue extends UseMonthDataResult {
  month: Month;
  /**
   * Opens the expense form: on `initial` to edit it, or empty, starting on `defaultCategoryKind`
   * and, for a category of the four, on `defaultTopicId` (the category the person came from).
   */
  openExpenseForm: (initial?: Expense, defaultCategoryKind?: CategoryKind, defaultTopicId?: string) => void;
  openIncomeForm: (initial?: Income) => void;
}

export const MonthContext = createContext<MonthContextValue | null>(null);

export function useMonthContext(): MonthContextValue {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error('useMonthContext deve ser usado dentro de MonthShell');
  return ctx;
}
