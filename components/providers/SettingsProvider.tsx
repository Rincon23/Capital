'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BudgetSettings } from '@/lib/budget';
import { budgetRepository } from '@/lib/storage';
import { toStorageErrorMessage } from '@/lib/storage/errors';

interface SettingsContextValue {
  settings: BudgetSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveSettings: (settings: BudgetSettings) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BudgetSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await budgetRepository.getSettings();
      setSettings(data);
    } catch (err) {
      setError(toStorageErrorMessage(err, 'Não foi possível carregar suas configurações.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // IndexedDB/Supabase have no synchronous or Suspense-compatible read API, so settings can
    // only be loaded after mount; this is the standard "fetch on mount" effect pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const saveSettings = useCallback(async (next: BudgetSettings) => {
    await budgetRepository.saveSettings(next);
    setSettings(next);
  }, []);

  // A failure here blocks every screen (they all need settings), so surface it
  // in place rather than letting each screen spin on "Carregando…".
  if (error && !settings) {
    return <StorageErrorScreen message={error} onRetry={refresh} retrying={loading} />;
  }

  return (
    <SettingsContext.Provider value={{ settings, loading, error, refresh, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

function StorageErrorScreen({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-foreground text-sm font-medium">Não foi possível carregar seus dados</p>
      <p className="text-muted text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 font-semibold disabled:opacity-50"
      >
        {retrying ? 'Tentando…' : 'Tentar novamente'}
      </button>
    </div>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings deve ser usado dentro de SettingsProvider');
  return ctx;
}
