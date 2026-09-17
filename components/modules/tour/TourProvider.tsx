'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '@/components/onboarding/tour.css';
import type { ModuleKey } from '@/lib/budget';
import { useLastViewedMonth } from '@/lib/hooks/useLastViewedMonth';
import { tourSteps, type TourStep } from '@/lib/modules';
import { requestTourSheet } from './tourSheets';

interface TourContextValue {
  /** Runs the tour of these modules, on the real screens, and comes back to where it started. */
  startTour: (modules: ModuleKey[]) => void;
  /** Whether a tour is on screen right now. */
  isTourActive: () => boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

/** How long a step waits for its screen (and its element) to show up after navigating. */
const WAIT_FOR_ELEMENT_MS = 8000;

/**
 * The tour engine: a spotlight (driver.js, with the app's look from tour.css) that darkens the
 * screen and cuts out what is being explained. It takes any list of steps from the modules'
 * tours, navigates between their screens and opens the sheets a step needs.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const month = useLastViewedMonth();
  const active = useRef<Driver | null>(null);
  useEffect(() => () => active.current?.destroy(), []);

  const startTour = useCallback(
    (modules: ModuleKey[]) => {
      active.current?.destroy();
      // Month screens carry the month in the URL; the tour uses the one on screen, if any.
      const monthOnScreen = window.location.pathname.match(/^\/mes\/([\d-]+)/)?.[1] ?? month;
      const steps = tourSteps(modules, monthOnScreen);
      if (steps.length === 0) return;

      const origin = `${window.location.pathname}${window.location.search}`;
      let current = -1;
      let finished = false;

      const here = () => `${window.location.pathname}${window.location.search}`;

      /** Leaves step `current` and prepares step `index`: its screen and its sheet. */
      const prepare = (index: number) => {
        const from: TourStep | undefined = steps[current];
        const to = steps[index];
        if (from?.sheet && from.sheet !== to.sheet) requestTourSheet('close');
        if (to.href !== here()) router.push(to.href);
        if (to.sheet && to.sheet !== from?.sheet) requestTourSheet(to.sheet);
        current = index;
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        if (steps[current]?.sheet) requestTourSheet('close');
        tour.destroy();
        active.current = null;
        if (here() !== origin) router.push(origin);
      };

      const tour: Driver = driver({
        showProgress: steps.length > 1,
        progressText: '{{current}} de {{total}}',
        allowClose: true,
        overlayOpacity: 0.7,
        stageRadius: 12,
        stagePadding: 6,
        waitForElement: WAIT_FOR_ELEMENT_MS,
        popoverClass: 'capital-tour-popover',
        nextBtnText: 'Próximo',
        prevBtnText: 'Voltar',
        doneBtnText: 'Entendi',
        steps: steps.map((step, index) => ({
          element: `[data-tour="${step.anchor}"]`,
          popover: {
            title: step.title,
            description: step.description,
            side: step.side,
            onNextClick: () => {
              if (index === steps.length - 1) return finish();
              prepare(index + 1);
              tour.moveTo(index + 1);
            },
            onPrevClick: () => {
              if (index === 0) return;
              prepare(index - 1);
              tour.moveTo(index - 1);
            },
          },
        })),
        onDestroyStarted: finish,
      });

      active.current = tour;
      prepare(0);
      tour.drive(0);
    },
    [month, router],
  );

  const isTourActive = useCallback(() => active.current !== null, []);

  const value = useMemo(() => ({ startTour, isTourActive }), [startTour, isTourActive]);
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour deve ser usado dentro de TourProvider');
  return ctx;
}
