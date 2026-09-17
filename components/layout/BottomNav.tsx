'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getLastViewedMonth } from '@/lib/storage/preferences';
import { currentMonthKey } from '@/lib/budget';
import { activeNavKey, navEntry, resolveNav } from '@/lib/modules';
import { navVisual } from '@/components/modules/visuals';
import { useSettings } from '@/components/providers/SettingsProvider';

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
  // The entries this user picked (or the default for the modules they turned on), then "Mais",
  // which is always there: the other screens, Módulos and Configurações live in it.
  const nav = settings ? resolveNav(settings) : [];
  const active = activeNavKey(nav, pathname);

  const tabs = [
    ...nav.map((key) => {
      const entry = navEntry(key);
      return { key, label: entry.label, href: entry.href(month), icon: navVisual(key).icon };
    }),
    ...(settings ? [{ key: 'mais' as const, label: 'Mais', href: '/mais', icon: LayoutGrid }] : []),
  ];

  return (
    <nav
      aria-label="Navegação principal"
      className="border-border bg-card/95 supports-[backdrop-filter]:bg-card/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex min-h-[56px] max-w-lg items-stretch justify-around">
        {tabs.map((tab) => {
          const current = active === tab.key;
          const Icon = tab.icon;
          return (
            <li key={tab.key} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                data-tour={`nav-${tab.key}`}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] leading-tight font-medium transition-colors ${
                  current ? 'text-primary' : 'text-muted hover:text-foreground'
                }`}
                aria-current={current ? 'page' : undefined}
              >
                <Icon aria-hidden className="h-6 w-6" strokeWidth={current ? 2.25 : 1.75} />
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
