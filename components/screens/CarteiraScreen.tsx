'use client';

import { CreditCard, PiggyBank, Repeat, Scale } from 'lucide-react';
import { formatBRL, formatMonthLabel, isInstallmentFinished, isModuleOn } from '@/lib/budget';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';
import { WalletHub, type WalletHubTile } from '@/components/wallet/WalletHub';
import { useWallet } from '@/components/wallet/WalletProvider';

/**
 * The Carteira tab: the way in to the four optional money modules. Only the ones the user
 * turned on show up, each with the one number that says how it is doing right now.
 */
export function CarteiraScreen() {
  const { settings } = useSettings();
  const { snapshot, error, month } = useWallet();

  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  const tiles: (WalletHubTile & { on: boolean })[] = [
    {
      key: 'recurring',
      on: isModuleOn(settings, 'recurring'),
      href: '/carteira/recorrentes',
      icon: Repeat,
      tone: 'blue',
      title: 'Recorrentes',
      value: snapshot
        ? formatBRL(snapshot.recurring.reduce((total, item) => total + item.amount, 0))
        : null,
      caption: snapshot ? `${plural(snapshot.recurring.length, 'modelo', 'modelos')} por mês` : 'Carregando…',
    },
    {
      key: 'installments',
      on: isModuleOn(settings, 'installments'),
      href: '/carteira/parcelados',
      icon: CreditCard,
      tone: 'orange',
      title: 'Parcelados',
      value: snapshot ? formatBRL(Math.abs(snapshot.cash.report.installmentDebt)) : null,
      caption: snapshot
        ? `a pagar · ${plural(
            snapshot.installments.filter((plan) => !isInstallmentFinished(plan, snapshot.today)).length,
            'compra',
            'compras',
          )}`
        : 'Carregando…',
    },
    {
      key: 'investments',
      on: isModuleOn(settings, 'investments'),
      href: '/carteira/reserva',
      icon: PiggyBank,
      tone: 'green',
      title: 'Reserva investida',
      value: snapshot
        ? snapshot.investments.price === null
          ? 'Sem cotação'
          : formatBRL(snapshot.investments.totalValue)
        : null,
      caption: snapshot
        ? snapshot.investments.price === null
          ? snapshot.investments.ticker
          : `${snapshot.investments.ticker} · ${formatBRL(snapshot.investments.price)}`
        : 'Carregando…',
    },
    {
      key: 'cash',
      on: isModuleOn(settings, 'cash'),
      href: '/carteira/caixa',
      icon: Scale,
      tone: 'purple',
      title: 'Caixa',
      value: snapshot ? formatBRL(snapshot.cash.report.gap) : null,
      valueTone: snapshot ? (snapshot.cash.report.gap >= 0 ? 'success' : 'danger') : undefined,
      caption: 'gap da reserva',
    },
  ];

  const enabled = tiles.filter((tile) => tile.on);
  const overview =
    snapshot && isModuleOn(settings, 'cash')
      ? {
          totalReserve: snapshot.cash.report.totalReserve,
          totalDebt: snapshot.cash.report.totalDebt,
          gap: snapshot.cash.report.gap,
          expectedReserve: snapshot.cash.report.expectedReserve,
        }
      : null;

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader title="Carteira" subtitle={`Competência: ${formatMonthLabel(month)}`} />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

      <WalletHub tiles={enabled} overview={overview} />

      {enabled.length > 0 && (
        <p className="text-muted px-4 text-xs">
          O que você lançar aqui entra em {formatMonthLabel(month)}, o mês que você estava vendo no
          Início.
        </p>
      )}
    </div>
  );
}
