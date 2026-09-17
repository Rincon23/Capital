'use client';

import Link from 'next/link';
import { formatMonthLabel, nextMonth, previousMonth, type Month } from '@/lib/budget';

/** ‹ Setembro de 2026 › — stays on the same screen (`path`, e.g. "/categorias") of the other month. */
export function MonthSwitcher({ month, path = '' }: { month: Month; path?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={`/mes/${previousMonth(month)}${path}`}
        aria-label="Mês anterior"
        className="text-foreground hover:bg-card flex h-11 w-11 items-center justify-center rounded-full text-xl"
      >
        ‹
      </Link>
      <span className="text-foreground text-lg font-semibold">{formatMonthLabel(month)}</span>
      <Link
        href={`/mes/${nextMonth(month)}${path}`}
        aria-label="Próximo mês"
        className="text-foreground hover:bg-card flex h-11 w-11 items-center justify-center rounded-full text-xl"
      >
        ›
      </Link>
    </div>
  );
}
