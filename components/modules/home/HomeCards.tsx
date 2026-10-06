'use client';

import type { ComponentType, ReactNode } from 'react';
import type { HomeWidgetKey } from '@/lib/budget';
import { widgetModule } from '@/lib/modules';
import { TodayRemindersCard } from '@/components/month/TodayRemindersCard';
import { RemindersProvider } from '@/components/reminders/RemindersProvider';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { CalendarHomeCard } from './CalendarHomeCard';
import { GmailHomeCard } from './GmailHomeCard';
import { HistoryHomeCard } from './HistoryHomeCard';
import { HomeCardBoundary } from './HomeCard';
import { BudgetHomeCard, ExpensesHomeCard, ReimbursableHomeTile } from './MonthCards';
import { CardHomeCard, CashHomeCard, InvestmentsHomeTile, RecurringHomeTile } from './WalletCards';

interface CardSpec {
  /** A tile takes half the width and sits next to the tiles around it. */
  size: 'full' | 'half';
  Component: ComponentType;
}

/** The widget of each module that has one (see `homeCard` in the catalog), plus the extra ones. */
const CARDS: Partial<Record<HomeWidgetKey, CardSpec>> = {
  expenses: { size: 'full', Component: ExpensesHomeCard },
  budget: { size: 'full', Component: BudgetHomeCard },
  card: { size: 'full', Component: CardHomeCard },
  reimbursable: { size: 'half', Component: ReimbursableHomeTile },
  history: { size: 'full', Component: HistoryHomeCard },
  recurring: { size: 'half', Component: RecurringHomeTile },
  investments: { size: 'half', Component: InvestmentsHomeTile },
  cash: { size: 'full', Component: CashHomeCard },
  reminders: { size: 'full', Component: TodayRemindersCard },
  calendar: { size: 'full', Component: CalendarHomeCard },
  gmail: { size: 'full', Component: GmailHomeCard },
};

/** The cards that read the wallet: they share one snapshot of it. */
const WALLET: HomeWidgetKey[] = ['card', 'recurring', 'investments', 'cash'];
/** The cards that read the reminders: they share one snapshot of them too. */
const REMINDERS: HomeWidgetKey[] = ['reminders', 'calendar'];

/** One read of the wallet and one of the reminders, shared by every card that needs them. */
export function HomeCardsData({ keys, children }: { keys: HomeWidgetKey[]; children: ReactNode }) {
  let content = children;
  if (keys.some((key) => REMINDERS.includes(key))) content = <RemindersProvider>{content}</RemindersProvider>;
  if (keys.some((key) => WALLET.includes(key))) content = <WalletProvider>{content}</WalletProvider>;
  return content;
}

/** The Início cards a person can stretch to full width in "Organizar Início" — the tiles only: a
 * full card (Lançamentos, Histórico, ...) has its own layout that only makes sense at full width. */
export const RESIZABLE_HOME_CARDS: HomeWidgetKey[] = (Object.keys(CARDS) as HomeWidgetKey[]).filter(
  (key) => CARDS[key]?.size === 'half',
);

/** `CARDS[key]`'s size, unless it is resizable and the user stretched it to full width. */
export function effectiveSize(
  key: HomeWidgetKey,
  sizes: Partial<Record<HomeWidgetKey, 'half' | 'full'>>,
): 'full' | 'half' | undefined {
  const spec = CARDS[key];
  if (!spec) return undefined;
  return spec.size === 'half' && sizes[key] === 'full' ? 'full' : spec.size;
}

/**
 * The dashboard's cards, in the given order. Consecutive tiles share a row two by two (an odd
 * one out takes the whole row). Each card loads its own data and fails on its own.
 */
export function HomeCards({
  keys,
  sizes = {},
}: {
  keys: HomeWidgetKey[];
  /** Full width for a resizable tile the user stretched; see `RESIZABLE_HOME_CARDS`. */
  sizes?: Partial<Record<HomeWidgetKey, 'half' | 'full'>>;
}) {
  const blocks: HomeWidgetKey[][] = [];
  for (const key of keys) {
    if (!CARDS[key]) continue;
    const last = blocks.at(-1);
    if (effectiveSize(key, sizes) === 'half' && last && effectiveSize(last[0], sizes) === 'half')
      last.push(key);
    else blocks.push([key]);
  }

  const content = (
    <div className="flex flex-col gap-3">
      {blocks.map((block) =>
        effectiveSize(block[0], sizes) === 'half' ? (
          <div key={block.join('-')} className="grid grid-cols-2 gap-3">
            {block.map((key, index) => (
              <div
                key={key}
                className={`grid min-w-0 ${block.length % 2 === 1 && index === block.length - 1 ? 'col-span-2' : ''}`}
              >
                <Card moduleKey={key} />
              </div>
            ))}
          </div>
        ) : (
          <Card key={block[0]} moduleKey={block[0]} />
        ),
      )}
    </div>
  );

  return <HomeCardsData keys={keys}>{content}</HomeCardsData>;
}

export function Card({ moduleKey }: { moduleKey: HomeWidgetKey }): ReactNode {
  const spec = CARDS[moduleKey];
  if (!spec) return null;
  const { Component } = spec;
  return (
    <HomeCardBoundary module={widgetModule(moduleKey)}>
      <Component />
    </HomeCardBoundary>
  );
}
