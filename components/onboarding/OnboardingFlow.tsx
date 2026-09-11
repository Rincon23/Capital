'use client';

import { useState } from 'react';
import type { BudgetSettings } from '@/lib/budget';
import { AppTour } from './AppTour';
import { OnboardingWizard } from './OnboardingWizard';

interface OnboardingFlowProps {
  settings: BudgetSettings;
  saveSettings: (settings: BudgetSettings) => Promise<void>;
  onClose: () => void;
}

/**
 * Orchestrates the two phases new (or returning-for-help) users go through: the setup
 * wizard, then a short tour of the app. "Pular" at any point in either phase ends the
 * whole thing via `onClose`. A reload only happens if the wizard actually wrote data
 * (settings/income/fixed costs), so a screen mounted behind the overlay never goes stale.
 */
export function OnboardingFlow({ settings, saveSettings, onClose }: OnboardingFlowProps) {
  const [phase, setPhase] = useState<'wizard' | 'tour'>('wizard');
  const [dataChanged, setDataChanged] = useState(false);

  function finish() {
    onClose();
    if (dataChanged) window.location.reload();
  }

  if (phase === 'wizard') {
    return (
      <OnboardingWizard
        settings={settings}
        saveSettings={saveSettings}
        onSkip={finish}
        onComplete={() => {
          setDataChanged(true);
          setPhase('tour');
        }}
      />
    );
  }

  return <AppTour onSkip={finish} onComplete={finish} />;
}
