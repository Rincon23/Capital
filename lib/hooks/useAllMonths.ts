'use client';

import { useCallback, useEffect, useState } from 'react';
import { computeMonthSummary, type MonthData, type MonthSummary } from '@/lib/budget';
import { budgetRepository } from '@/lib/storage';

export interface UseAllMonthsResult {
  monthsData: MonthData[];
  summaries: MonthSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/** Loads every stored month, oldest to newest, for the history/charts screen. */
export function useAllMonths(): UseAllMonthsResult {
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const keys = await budgetRepository.listMonths();
    const all = await Promise.all(keys.map((key) => budgetRepository.getMonth(key)));
    const sorted = all
      .filter((m): m is MonthData => m !== undefined)
      .sort((a, b) => a.month.localeCompare(b.month));
    setMonthsData(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    // IndexedDB has no synchronous or Suspense-compatible read API, so months can only
    // be loaded after mount; this is the standard "fetch on mount" effect pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const summaries = monthsData.map((data) => computeMonthSummary(data));

  return { monthsData, summaries, loading, refresh };
}
