'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ModuleKey } from '@/lib/budget';
import { isModuleOn } from '@/lib/modules';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useTour } from './tour/TourProvider';

/** The notice key that says a person already had a module's introduction. */
export const introNotice = (module: ModuleKey) => `intro:${module}`;

/** Introductions already started in this tab, so a re-render never starts one twice. */
const started = new Set<string>();

/**
 * The first time a person opens a module's screen, it introduces itself: the setup questions, if
 * the module has any (`withSetup`), and then its tour. Remembered per account in the settings'
 * dismissed notices, so it happens once, on whichever device comes first. The help button replays
 * the tour whenever they want.
 *
 * `ready` is when the screen has its content on screen (the tour needs its elements).
 */
export function useModuleIntro(module: ModuleKey, { ready, withSetup = false }: { ready: boolean; withSetup?: boolean }) {
  const { settings, saveSettings } = useSettings();
  const { startTour, isTourActive } = useTour();
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    if (!ready || !settings || !isModuleOn(settings, module)) return;
    const key = introNotice(module);
    if (settings.dismissedNotices?.includes(key) || started.has(key)) return;
    // Another tour walked in here (it navigates across screens): this one waits for a real visit.
    if (isTourActive()) return;
    started.add(key);

    void saveSettings({ ...settings, dismissedNotices: [...(settings.dismissedNotices ?? []), key] }).catch(
      () => started.delete(key),
    );
    if (withSetup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSetupOpen(true);
    } else {
      startTour([module]);
    }
  }, [ready, settings, saveSettings, module, withSetup, startTour, isTourActive]);

  /** The setup was finished or skipped: now the tour. */
  const finishSetup = useCallback(() => {
    setSetupOpen(false);
    startTour([module]);
  }, [module, startTour]);

  return { setupOpen, finishSetup };
}
