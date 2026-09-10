'use client';

import Link from 'next/link';
import { formatMonthLabel, nextMonth, previousMonth, type Month } from '@/lib/budget';

export function MonthSwitcher({ month }: { month: Month }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={`/mes/${previousMonth(month)}`}
        aria-label="Mês anterior"
        className="text-foreground hover:bg-card flex h-11 w-11 items-center justify-center rounded-full text-xl"
      >
        ‹
      </Link>
      <span className="text-foreground text-lg font-semibold">{formatMonthLabel(month)}</span>
      <Link
        href={`/mes/${nextMonth(month)}`}
        aria-label="Próximo mês"
        className="text-foreground hover:bg-card flex h-11 w-11 items-center justify-center rounded-full text-xl"
      >
        ›
      </Link>
    </div>
  );
}
