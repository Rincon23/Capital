'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BudgetSettings } from '@/lib/budget';
import { budgetRepository } from '@/lib/storage';

interface SettingsContextValue {
  settings: BudgetSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  saveSettings: (settings: BudgetSettings) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BudgetSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await budgetRepository.getSettings();
    setSettings(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // IndexedDB has no synchronous or Suspense-compatible read API, so settings can only
    // be loaded after mount; this is the standard "fetch on mount" effect pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const saveSettings = useCallback(async (next: BudgetSettings) => {
    await budgetRepository.saveSettings(next);
    setSettings(next);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings deve ser usado dentro de SettingsProvider');
  return ctx;
}
