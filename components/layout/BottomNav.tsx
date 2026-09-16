'use client';

import { useEffect, useState } from 'react';
import {
  Bell,
  ChartColumn,
  House,
  LayoutGrid,
  ReceiptText,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getLastViewedMonth } from '@/lib/storage/preferences';
import { currentMonthKey } from '@/lib/budget';
import { navItemsFor, type NavKey } from '@/lib/nav/items';
import { useSettings } from '@/components/providers/SettingsProvider';

/** One icon per tab, from the same set used across the app (lucide), so they read as a family. */
const ICONS: Record<NavKey, LucideIcon> = {
  inicio: House,
  lancamentos: ReceiptText,
  lembretes: Bell,
  carteira: Wallet,
  historico: ChartColumn,
  configuracoes: Settings,
  mais: LayoutGrid,
};

export function BottomNav() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const monthFromPath = pathname.match(/^\/mes\/([\d-]+)/)?.[1];
  // Starts from `currentMonthKey()` (deterministic, matches the server) so hydration never
  // sees a mismatched href; the last-viewed month (localStorage, client-only) is applied
  // after mount instead.
  const [fallbackMonth, setFallbackMonth] = useState(currentMonthKey);

  useEffect(() => {
    if (monthFromPath) return;
    const stored = getLastViewedMonth();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setFallbackMonth(stored);
  }, [monthFromPath]);

  const month = monthFromPath ?? fallbackMonth;
  // Which tabs exist depends on the modules this user turned on (see lib/nav/items.ts).
  const items = navItemsFor(settings);

  return (
    <nav
      aria-label="Navegação principal"
      className="border-border bg-card/95 supports-[backdrop-filter]:bg-card/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map((item) => {
          const active = item.isActive(pathname);
          const Icon = ICONS[item.key];
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href(month)}
                data-tour={item.tourId}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                  active ? 'text-primary' : 'text-muted hover:text-foreground'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
