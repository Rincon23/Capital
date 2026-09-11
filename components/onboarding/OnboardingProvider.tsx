'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { getHasCompletedOnboarding, setHasCompletedOnboarding } from '@/lib/storage/preferences';
import { OnboardingFlow } from './OnboardingFlow';

interface OnboardingContextValue {
  /** Reopens the wizard + tour on demand (e.g. the "Me ajude a configurar" button in Configurações). */
  open: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Mounted once for every authenticated route. Auto-opens the onboarding wizard for
 * users who have never finished (or skipped) it on this device, and exposes `open()`
 * so any screen can relaunch the whole flow later.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { settings, saveSettings } = useSettings();
  const [active, setActive] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!getHasCompletedOnboarding()) setActive(true);
  }, []);

  const open = useCallback(() => setActive(true), []);

  const close = useCallback(() => {
    setHasCompletedOnboarding(true);
    setActive(false);
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
