'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getLastViewedMonth } from '@/lib/storage/preferences';
import { currentMonthKey } from '@/lib/budget';
import { navItemsFor, type NavKey } from '@/lib/nav/items';
import { useSettings } from '@/components/providers/SettingsProvider';

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h12M8 12h12M8 18h12" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V9m6.5 10V5m6.5 14v-7" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="h-6 w-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 8a6 6 0 1 0-12 0c0 3.5-.7 5.2-1.5 6.2-.4.5 0 1.3.6 1.3h13.8c.7 0 1-.8.6-1.3C18.7 13.2 18 11.5 18 8Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="h-6 w-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12h3v3h-3a1.5 1.5 0 0 1 0-3Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" stroke="currentColor" className="h-6 w-6">
      <path strokeLinecap="round" d="M6 12h.01M12 12h.01M18 12h.01" />
    </svg>
  );
}

const ICONS: Record<NavKey, ReactNode> = {
  inicio: <HomeIcon />,
  lancamentos: <ListIcon />,
  lembretes: <BellIcon />,
  carteira: <WalletIcon />,
  historico: <ChartIcon />,
  configuracoes: <GearIcon />,
  mais: <MoreIcon />,
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
                {ICONS[item.key]}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
