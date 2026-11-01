'use client';

import { useEffect, useState } from 'react';
import {
  computeMonthSummary,
  currentMonthKey,
  type Month,
  type MonthData,
  type MonthSummary,
  type TopicConfig,
} from '@/lib/budget';
import { budgetRepository } from '@/lib/storage';

export interface MonthToClose {
  /** The month that ended, with what was left in each category. */
  summary: MonthSummary;
  /** Closes it, with the answer about the leftovers. The month on screen needs a refresh after it. */
  close: (bringLeftovers: boolean) => Promise<void>;
}

/**
 * What the turn of the month leaves to do: on today's month, the last month before it, while it is
 * still open. A month nobody used is skipped: the leftovers come from the last one that exists. A
 * failed read only leaves the button out, since every month still has its own "Fechar mês".
 */
export function useMonthToClose(month: Month, currentTopics?: TopicConfig[]): MonthToClose | null {
  const [data, setData] = useState<MonthData | null>(null);

  useEffect(() => {
    let stale = false;
    async function load() {
      const last =
        month === currentMonthKey()
          ? (await budgetRepository.listMonths()).filter((stored) => stored < month).at(-1)
          : undefined;
      const found = last ? await budgetRepository.getMonth(last) : undefined;
      if (!stale) setData(found && !found.closed ? found : null);
    }
    load().catch(() => {
      if (!stale) setData(null);
    });
    return () => {
      stale = true;
    };
  }, [month]);

  if (!data) return null;
  return {
    summary: computeMonthSummary(data, currentTopics),
    close: async (bringLeftovers) => {
      // No need to open the month on screen: until it is stored, it reads the answer from here.
      await budgetRepository.closeMonth(data.month, false, !bringLeftovers);
      setData(null);
    },
  };
}
