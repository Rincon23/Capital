'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Blocks, Check, Pencil } from 'lucide-react';
import { isModuleOn, resolveHomeCards } from '@/lib/modules';
import { EditableHomeCards } from '@/components/modules/home/EditableHomeCards';
import { HomeCards } from '@/components/modules/home/HomeCards';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { GreetingHeader } from '@/components/month/GreetingHeader';
import { MONTH_ACTIONS_PADDING, MonthActions } from '@/components/month/MonthActions';
import { useMonthContext } from '@/components/month/MonthContext';
import { MonthSwitcher } from '@/components/month/MonthSwitcher';
import { useSettings } from '@/components/providers/SettingsProvider';
import { IconTile } from '@/components/ui/IconTile';

/** Início: a card with the summary of each module that is on, in the order the user picked. */
export function DashboardScreen() {
  const { month } = useMonthContext();
  const { settings } = useSettings();
  const [editing, setEditing] = useState(false);

  if (!settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const cards = resolveHomeCards(settings);
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
          <div className="flex items-center gap-1">
            {cards.length > 0 && (
              <button
                type="button"
                onClick={() => setEditing((current) => !current)}
                aria-label={editing ? 'Concluir organização da Início' : 'Organizar Início'}
                title={editing ? 'Concluído' : 'Organizar Início'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                  editing
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted hover:text-foreground hover:bg-card'
                }`}
              >
                {editing ? <Check aria-hidden className="h-5 w-5" /> : <Pencil aria-hidden className="h-5 w-5" />}
              </button>
            )}
            <NotificationBell />
          </div>
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
        ) : editing ? (
          <EditableHomeCards keys={cards} sizes={settings.homeCardSizes ?? {}} />
        ) : (
          <HomeCards keys={cards} sizes={settings.homeCardSizes} />
        )}
        {editing && cards.length > 0 && (
          <p className="text-muted pb-4 text-center text-sm">
            Segure e arraste um card para reorganizar. Toque em{' '}
            <Check aria-hidden className="inline h-4 w-4 align-text-bottom" /> quando terminar.
          </p>
        )}
      </div>

      {withActions && !editing && <MonthActions />}
    </div>
  );
}
