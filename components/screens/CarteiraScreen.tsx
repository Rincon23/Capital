'use client';

import Link from 'next/link';
import {
  formatBRL,
  formatMonthLabel,
  isInstallmentFinished,
  isModuleOn,
  type ModuleKey,
} from '@/lib/budget';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useWallet } from '@/components/wallet/WalletProvider';

/**
 * The Carteira tab: the way in to the four optional money modules. Only the ones the user
 * turned on show up, each with the one number that says how it is doing right now.
 */
export function CarteiraScreen() {
  const { settings } = useSettings();
  const { snapshot, loading, error, month } = useWallet();

  const areas: { module: ModuleKey; href: string; title: string; summary: string }[] = [
    {
      module: 'recurring',
      href: '/carteira/recorrentes',
      title: 'Gastos recorrentes',
      summary: snapshot
        ? `${snapshot.recurring.length} ${snapshot.recurring.length === 1 ? 'modelo' : 'modelos'} · ${formatBRL(
            snapshot.recurring.reduce((total, item) => total + item.amount, 0),
          )} por mês`
        : 'Modelos dos gastos que se repetem todo mês.',
    },
    {
      module: 'installments',
      href: '/carteira/parcelados',
      title: 'Parcelados',
      summary: snapshot
        ? `${snapshot.installments.filter((plan) => !isInstallmentFinished(plan, snapshot.today)).length} em andamento · ${formatBRL(
            snapshot.cash.report.installmentDebt,
          )} a pagar`
        : 'Compras divididas em parcelas no cartão.',
    },
    {
      module: 'investments',
      href: '/carteira/reserva',
      title: 'Reserva investida',
      summary: snapshot
        ? snapshot.investments.price === null
          ? `${snapshot.investments.ticker} · sem cotação`
          : `${formatBRL(snapshot.investments.totalValue)} em ${snapshot.investments.ticker}`
        : 'Sua reserva em cotas, dividida em baldes.',
    },
    {
      module: 'cash',
      href: '/carteira/caixa',
      title: 'Caixa',
      summary: snapshot
        ? `Gap da reserva: ${formatBRL(snapshot.cash.report.gap)}`
        : 'Reserva, dívidas e quanto falta para a meta.',
    },
  ];

  const enabled = areas.filter((area) => isModuleOn(settings, area.module));

  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader title="Carteira" subtitle={`Competência: ${formatMonthLabel(month)}`} />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

      <ul className="flex flex-col gap-2 px-4">
        {enabled.map((area) => (
          <li key={area.module}>
            <Link
              href={area.href}
              className="border-border bg-card flex min-h-[64px] w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 shadow-sm"
            >
              <span className="min-w-0">
                <span className="text-foreground block font-medium">{area.title}</span>
                <span className="text-muted block text-xs">
                  {loading && !snapshot ? 'Carregando…' : area.summary}
                </span>
              </span>
              <span aria-hidden className="text-muted text-xl">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {enabled.length === 0 && (
        <p className="text-muted px-4 py-10 text-center text-sm">
          Nenhum módulo da Carteira está ligado. Ligue os que você quiser usar em Configurações.
        </p>
      )}

      <p className="text-muted px-4 text-xs">
        O que você lançar aqui entra na competência de {formatMonthLabel(month)} — o mês que você
        estava vendo no Início.
      </p>
    </div>
  );
}
