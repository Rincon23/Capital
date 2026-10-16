'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { formatMonthLabel, nextMonth, previousMonth, type Month } from '@/lib/budget';
import { useMonthSwipe } from './MonthSwipe';
import { MonthSwipeHint } from './MonthSwipeHint';

/**
 * ‹ Setembro de 2026 › — stays on the same screen (`path`, e.g. "/categorias") of the other month.
 * Inside a `MonthSwipe` the arrows slide the month like a swipe does. Changing month replaces the
 * page in the history, so the phone's back goes to where the screen was opened from.
 */
export function MonthSwitcher({ month, path = '' }: { month: Month; path?: string }) {
  const slide = useMonthSwipe();

  const handleClick = (step: 1 | -1) => (event: MouseEvent<HTMLAnchorElement>) => {
    // A new tab (Ctrl/⌘-click, middle button) is the browser's.
    if (!slide || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    slide(step);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={`/mes/${previousMonth(month)}${path}`}
        replace
        onClick={handleClick(-1)}
        aria-label="Mês anterior"
        className="text-foreground hover:bg-card flex h-11 w-11 items-center justify-center rounded-full text-xl"
      >
        ‹
      </Link>
      <span className="flex flex-col items-center">
        <span className="text-foreground text-lg font-semibold">{formatMonthLabel(month)}</span>
        <MonthSwipeHint month={month} />
      </span>
      <Link
        href={`/mes/${nextMonth(month)}${path}`}
        replace
        onClick={handleClick(1)}
        aria-label="Próximo mês"
        className="text-foreground hover:bg-card flex h-11 w-11 items-center justify-center rounded-full text-xl"
      >
        ›
      </Link>
    </div>
  );
}
