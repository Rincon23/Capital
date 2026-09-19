'use client';

import type { ComponentType, ReactNode } from 'react';
import type { ModuleKey } from '@/lib/budget';
import { TodayRemindersCard } from '@/components/month/TodayRemindersCard';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { GmailHomeCard } from './GmailHomeCard';
import { HistoryHomeCard } from './HistoryHomeCard';
import { HomeCardBoundary } from './HomeCard';
import { BudgetHomeCard, CardHomeTile, ExpensesHomeCard, ReimbursableHomeTile } from './MonthCards';
import {
  CardsHomeTile,
  CashHomeCard,
  InstallmentsHomeTile,
  InvestmentsHomeTile,
  RecurringHomeTile,
} from './WalletCards';

interface CardSpec {
  /** A tile takes half the width and sits next to the tiles around it. */
  size: 'full' | 'half';
  Component: ComponentType;
}

/** The home card of each module that has one (see `homeCard` in the catalog). */
const CARDS: Partial<Record<ModuleKey, CardSpec>> = {
  expenses: { size: 'full', Component: ExpensesHomeCard },
  budget: { size: 'full', Component: BudgetHomeCard },
  card: { size: 'half', Component: CardHomeTile },
  reimbursable: { size: 'half', Component: ReimbursableHomeTile },
  history: { size: 'full', Component: HistoryHomeCard },
  recurring: { size: 'half', Component: RecurringHomeTile },
  cards: { size: 'half', Component: CardsHomeTile },
  installments: { size: 'half', Component: InstallmentsHomeTile },
  investments: { size: 'half', Component: InvestmentsHomeTile },
  cash: { size: 'full', Component: CashHomeCard },
  reminders: { size: 'full', Component: TodayRemindersCard },
  gmail: { size: 'full', Component: GmailHomeCard },
};

const WALLET: ModuleKey[] = ['recurring', 'cards', 'installments', 'investments', 'cash'];

/** The Início cards a person can stretch to full width in "Organizar Início" — the tiles only: a
 * full card (Lançamentos, Histórico, ...) has its own layout that only makes sense at full width. */
export const RESIZABLE_HOME_CARDS: ModuleKey[] = (Object.keys(CARDS) as ModuleKey[]).filter(
  (key) => CARDS[key]?.size === 'half',
);

/** `CARDS[key]`'s size, unless it is resizable and the user stretched it to full width. */
export function effectiveSize(
  key: ModuleKey,
  sizes: Partial<Record<ModuleKey, 'half' | 'full'>>,
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
  keys: ModuleKey[];
  /** Full width for a resizable tile the user stretched; see `RESIZABLE_HOME_CARDS`. */
  sizes?: Partial<Record<ModuleKey, 'half' | 'full'>>;
}) {
  const blocks: ModuleKey[][] = [];
  for (const key of keys) {
    if (!CARDS[key]) continue;
    const last = blocks.at(-1);
    if (effectiveSize(key, sizes) === 'half' && last && effectiveSize(last[0], sizes) === 'half') last.push(key);
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

  // The four Carteira cards share one read of the wallet.
  return keys.some((key) => WALLET.includes(key)) ? <WalletProvider>{content}</WalletProvider> : content;
}

export function Card({ moduleKey }: { moduleKey: ModuleKey }): ReactNode {
  const spec = CARDS[moduleKey];
  if (!spec) return null;
  const { Component } = spec;
  return (
    <HomeCardBoundary module={moduleKey}>
      <Component />
    </HomeCardBoundary>
  );
}
