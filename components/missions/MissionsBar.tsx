'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { nextMissions } from '@/lib/gamification/missions';
import { useMissions } from './MissionsProvider';
import { LevelIcon } from './levelVisuals';

/**
 * Missões on top of the Início, under the greeting, for everyone and not a widget (nothing to take
 * off): the level's tree and name, a thin bar to the next level and the next mission to do. A tap
 * opens Missões. Only there while some mission is open: with nothing to do, it is not shown.
 */
export function MissionsBar() {
  const { status, level } = useMissions();
  const [next] = status ? nextMissions(status.missions, 1) : [];
  if (!next || !level) return null;
  const pct = Math.round(level.progress * 100);

  return (
    <Link
      href="/missoes"
      data-tour="card-missions"
      aria-label={`Missões: ${level.name}, nível ${level.level}`}
      className="border-border bg-card flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-sm"
    >
      <span aria-hidden className="bg-series-3/15 text-series-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
        <LevelIcon level={level.level} className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-foreground truncate text-sm font-semibold">{level.name}</span>
          <span className="text-muted shrink-0 text-xs tabular-nums">
            {level.next === null ? `${level.xp} XP` : `${level.xp} / ${level.next} XP`}
          </span>
        </span>
        <span aria-hidden className="bg-border block h-1.5 w-full overflow-hidden rounded-full">
          <span className="bg-success-fill block h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs">
          <span className="text-foreground truncate font-medium">{next.title}</span>
          <span className="text-success shrink-0 font-semibold tabular-nums">+{next.xp} XP</span>
        </span>
      </span>
      <ChevronRight aria-hidden className="text-muted h-4 w-4 shrink-0" />
    </Link>
  );
}
