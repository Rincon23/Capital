'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { levelOf, type LevelProgress } from '@/lib/gamification/levels';
import {
  missionDefinition,
  visitsForPath,
  type MissionKey,
  type MissionsStatus,
} from '@/lib/gamification/missions';
import { DATA_CHANGED_EVENT } from '@/lib/storage/apiClient';
import { checkMissions } from '@/lib/storage/missions';
import { useTour } from '@/components/modules/tour/TourProvider';
import { useToast } from '@/components/ui/Toast';
import { LevelUpCard } from './LevelUpCard';
import { WelcomeCard } from './WelcomeCard';

interface MissionsContextValue {
  /** Null until the first check comes back. */
  status: MissionsStatus | null;
  level: LevelProgress | null;
  /** Reports a mission done by going somewhere that is not a screen of its own (a tab, a sheet). */
  visit: (key: MissionKey) => void;
}

const MissionsContext = createContext<MissionsContextValue | null>(null);

/** How long after a save the missions are checked: a burst of saves becomes one check. */
const AFTER_SAVE_MS = 700;

const installed = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * The Missões of the signed-in account (lib/gamification/missions.ts). It checks them when the app
 * opens (which is itself the mission of the day), when it comes back to the screen, after anything
 * is saved and on every screen visited — the server gives the XP, once per period. What was just
 * earned shows as a toast ("+30 XP · Lançar um gasto"), a new level as a card with its name, and
 * the very first open of a new account as the welcome (WelcomeCard).
 */
export function MissionsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { showToast } = useToast();
  const { isTourActive } = useTour();
  const [status, setStatus] = useState<MissionsStatus | null>(null);
  const [levelUp, setLevelUp] = useState<LevelProgress | null>(null);
  const [welcome, setWelcome] = useState(false);
  const statusRef = useRef<MissionsStatus | null>(null);
  const pending = useRef<Set<MissionKey>>(new Set());
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** A toast waits while a spotlight is up: it would cover the very button being pointed at. */
  const toast = useCallback(
    (message: string) => {
      const show = (tries: number) => {
        if (isTourActive() && tries > 0) setTimeout(() => show(tries - 1), 500);
        else showToast(message, 'success');
      };
      show(60);
    },
    [isTourActive, showToast],
  );

  const celebrate = useCallback(
    (before: MissionsStatus | null, after: MissionsStatus) => {
      const total = after.earned.reduce((sum, item) => sum + item.xp, 0);
      if (total === 0) return;
      const level = levelOf(after.xp);
      // A brand-new account (all its XP is what it just got for opening the app): the welcome.
      if (!before && after.xp === total && after.earned.length < 3) {
        setWelcome(true);
        return;
      }
      // The first check of an account that already did things: one notice, not a party per mission.
      if (!before && after.earned.length >= 3) {
        toast(`Você já tinha ${after.xp} XP · ${level.name}`);
        return;
      }
      const title = after.earned.length === 1 ? missionDefinition(after.earned[0].key)?.title : null;
      toast(`+${total} XP · ${title ?? `${after.earned.length} missões`}`);
      if (before && levelOf(before.xp).level < level.level) setLevelUp(level);
    },
    [toast],
  );

  /** One check at a time; one asked for meanwhile runs right after, with what piled up. */
  const run = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const visits = [...pending.current];
        pending.current.clear();
        try {
          const next = await checkMissions(visits);
          const before = statusRef.current;
          statusRef.current = next;
          setStatus(next);
          celebrate(before, next);
        } catch {
          // Offline or a hiccup: the next check catches up (the server keeps what was done).
        }
      } while (again.current);
    } finally {
      running.current = false;
    }
  }, [celebrate]);

  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), delay);
    },
    [run],
  );

  /** Queues visits worth sending: not done yet, and missions the account has (once that is known). */
  const queue = useCallback((keys: MissionKey[]) => {
    const current = statusRef.current;
    const worth = keys.filter(
      (key) => !current || current.missions.some((mission) => mission.key === key && !mission.done),
    );
    for (const key of worth) pending.current.add(key);
    return worth.length > 0;
  }, []);

  // Opening the app: the mission of the day, the installed app, and the screen it opened on.
  useEffect(() => {
    queue(['open-app', ...(installed() ? (['install-app'] as const) : [])]);
    schedule(0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [queue, schedule]);

  // Every screen visited: the first visit to a module, the month's checks.
  useEffect(() => {
    if (queue(visitsForPath(pathname, window.location.search))) schedule(statusRef.current ? 0 : 50);
  }, [pathname, queue, schedule]);

  // After a save, and when the app comes back to the screen (maybe on another day).
  useEffect(() => {
    const afterSave = () => schedule(AFTER_SAVE_MS);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      queue(['open-app']);
      schedule(0);
    };
    window.addEventListener(DATA_CHANGED_EVENT, afterSave);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, afterSave);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [queue, schedule]);

  const visit = useCallback(
    (key: MissionKey) => {
      if (queue([key])) schedule(0);
    },
    [queue, schedule],
  );

  const value = useMemo(
    () => ({ status, level: status ? levelOf(status.xp) : null, visit }),
    [status, visit],
  );

  return (
    <MissionsContext.Provider value={value}>
      {children}
      {levelUp && <LevelUpCard level={levelUp} onClose={() => setLevelUp(null)} />}
      {welcome && status && <WelcomeCard status={status} onClose={() => setWelcome(false)} />}
    </MissionsContext.Provider>
  );
}

const OUTSIDE: MissionsContextValue = { status: null, level: null, visit: () => {} };

/** The Missões of the account; outside the signed-in app (a test, a lone sheet), nothing happens. */
export function useMissions(): MissionsContextValue {
  return useContext(MissionsContext) ?? OUTSIDE;
}
