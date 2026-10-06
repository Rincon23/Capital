'use client';

import { usePathname } from 'next/navigation';
import { homeHref } from '@/lib/modules';
import { useLastViewedMonth } from '@/lib/hooks/useLastViewedMonth';

/**
 * Where a screen's back arrow goes: the Início, like closing an app on a phone lands on the home
 * screen. A screen of a month (Lançamentos, Categorias) goes back to the Início of that same
 * month; any other, to the month last seen.
 */
export function useHomeHref(): string {
  const pathname = usePathname();
  const lastViewed = useLastViewedMonth();
  return homeHref(pathname.match(/^\/mes\/([\d-]+)/)?.[1] ?? lastViewed);
}
