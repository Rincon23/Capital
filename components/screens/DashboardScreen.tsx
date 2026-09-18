'use client';

import Link from 'next/link';
import { Blocks } from 'lucide-react';
import { homeCards, isModuleOn } from '@/lib/modules';
import { HomeCards } from '@/components/modules/home/HomeCards';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { GreetingHeader } from '@/components/month/GreetingHeader';
import { MONTH_ACTIONS_PADDING, MonthActions } from '@/components/month/MonthActions';
import { useMonthContext } from '@/components/month/MonthContext';
import { MonthSwitcher } from '@/components/month/MonthSwitcher';
import { useSettings } from '@/components/providers/SettingsProvider';
import { IconTile } from '@/components/ui/IconTile';

/** Início: a card with the summary of each module that is on, in the order of the bottom bar. */
export function DashboardScreen() {
  const { month } = useMonthContext();
  const { settings } = useSettings();

  if (!settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const cards = homeCards(settings);
  const withActions = isModuleOn(settings, 'expenses');
  // The month only matters to the cards of the month (Lançamentos, Categorias, Cartão, A receber, Histórico).
  const monthly = cards.some((key) =>
    ['expenses', 'budget', 'card', 'reimbursable', 'history'].includes(key),
  );

  return (
    <div className={`flex flex-1 flex-col ${withActions ? MONTH_ACTIONS_PADDING : 'pb-10'}`}>
      <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex flex-col gap-3 border-b px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <GreetingHeader />
          <NotificationBell />
        </div>
        {monthly && <MonthSwitcher month={month} />}
      </div>

      <div className="flex flex-col gap-4 px-4 pt-4">
        {cards.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center gap-3 rounded-2xl border p-6 text-center shadow-sm">
            <IconTile icon={Blocks} tone="blue" size="lg" />
            <p className="text-foreground font-semibold">Escolha o que o seu Capital vai ter</p>
            <p className="text-muted text-sm">
              Cada recurso do app é um módulo: lançamentos, metas por categoria, cartão, lembretes e mais. Ligue
              os que você quer usar e o resumo de cada um aparece aqui.
            </p>
            <Link
              href="/modulos"
              className="bg-primary text-primary-foreground flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold"
            >
              Escolher módulos
            </Link>
          </div>
        ) : (
          <HomeCards keys={cards} />
        )}
      </div>

      {withActions && <MonthActions />}
    </div>
  );
}
