'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getLastViewedMonth } from '@/lib/storage/preferences';
import { currentMonthKey } from '@/lib/budget';

interface NavItem {
  href: (month: string) => string;
  label: string;
  match: (pathname: string) => boolean;
  icon: React.ReactNode;
}

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

const NAV_ITEMS: NavItem[] = [
  {
    href: (m) => `/mes/${m}`,
    label: 'Início',
    match: (p) => p.startsWith('/mes/') && !p.includes('/lancamentos') && !p.includes('/categoria'),
    icon: <HomeIcon />,
  },
  {
    href: (m) => `/mes/${m}/lancamentos`,
    label: 'Lançamentos',
    match: (p) => p.includes('/lancamentos'),
    icon: <ListIcon />,
  },
  {
    href: () => '/historico',
    label: 'Histórico',
    match: (p) => p.startsWith('/historico'),
    icon: <ChartIcon />,
  },
  {
    href: () => '/configuracoes',
    label: 'Config.',
    match: (p) => p.startsWith('/configuracoes'),
    icon: <GearIcon />,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const month = pathname.match(/^\/mes\/([\d-]+)/)?.[1] ?? getLastViewedMonth() ?? currentMonthKey();

  return (
    <nav
      aria-label="Navegação principal"
      className="border-border bg-card/95 supports-[backdrop-filter]:bg-card/80 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.label} className="flex-1">
              <Link
                href={item.href(month)}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                  active ? 'text-primary' : 'text-muted hover:text-foreground'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
