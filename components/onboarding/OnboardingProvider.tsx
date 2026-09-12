'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { budgetRepository } from '@/lib/storage';
import { OnboardingFlow } from './OnboardingFlow';

interface OnboardingContextValue {
  /** Reopens the wizard + tour on demand (e.g. the "Me ajude a configurar" button in Configurações). */
  open: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Mounted once for every authenticated route. Auto-opens the onboarding wizard for
 * accounts that have never finished (or skipped) it — tracked server-side per account,
 * not per device, so it doesn't reappear on a new browser or after local storage is
 * cleared — and exposes `open()` so any screen can relaunch the whole flow later.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { settings, saveSettings } = useSettings();
  const [active, setActive] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked || !settings) return;
    setChecked(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (settings.onboardingCompleted === false) setActive(true);
  }, [checked, settings]);

  const open = useCallback(() => setActive(true), []);

  const close = useCallback(() => {
    setActive(false);
    void budgetRepository.completeOnboarding();
  }, []);

  return (
    <OnboardingContext.Provider value={{ open }}>
      {children}
      {active && settings && (
        <OnboardingFlow settings={settings} saveSettings={saveSettings} onClose={close} />
      )}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding deve ser usado dentro de OnboardingProvider');
  return ctx;
}
