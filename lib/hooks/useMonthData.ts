'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  computeMonthSummary,
  type Expense,
  type Income,
  type Month,
  type MonthData,
  type MonthSummary,
} from '@/lib/budget';
import { budgetRepository } from '@/lib/storage';
import { toStorageErrorMessage } from '@/lib/storage/errors';

export interface UseMonthDataResult {
  monthData: MonthData | null;
  summary: MonthSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  saveIncome: (income: Income) => Promise<void>;
  deleteIncome: (incomeId: string) => Promise<void>;
  closeMonth: () => Promise<void>;
  reopenMonth: () => Promise<void>;
}

/** Loads (creating if needed) and mutates a single competence month, backed by the repository. */
export function useMonthData(month: Month): UseMonthDataResult {
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await budgetRepository.ensureMonth(month);
      setMonthData(data);
    } catch (err) {
      setError(toStorageErrorMessage(err, 'Erro ao carregar o mês.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    // IndexedDB has no synchronous or Suspense-compatible read API, so a month can only
    // be loaded after mount; this is the standard "fetch on mount" effect pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const guard = useCallback(
    async (action: () => Promise<void>) => {
      setError(null);
      try {
        await action();
        await refresh();
      } catch (err) {
        setError(toStorageErrorMessage(err, 'Erro ao salvar.'));
        throw err;
      }
    },
    [refresh],
  );

  const saveExpense = useCallback(
    (expense: Expense) => guard(() => budgetRepository.saveExpense(month, expense)),
    [guard, month],
  );
  const deleteExpense = useCallback(
    (id: string) => guard(() => budgetRepository.deleteExpense(month, id)),
    [guard, month],
  );
  const saveIncome = useCallback(
    (income: Income) => guard(() => budgetRepository.saveIncome(month, income)),
    [guard, month],
  );
  const deleteIncome = useCallback(
    (id: string) => guard(() => budgetRepository.deleteIncome(month, id)),
    [guard, month],
  );
  const closeMonth = useCallback(() => guard(() => budgetRepository.closeMonth(month)), [guard, month]);
  const reopenMonth = useCallback(() => guard(() => budgetRepository.reopenMonth(month)), [guard, month]);

  const summary = monthData ? computeMonthSummary(monthData) : null;

  return {
    monthData,
    summary,
    loading,
    error,
    refresh,
    saveExpense,
    deleteExpense,
    saveIncome,
    deleteIncome,
    closeMonth,
    reopenMonth,
  };
}
