'use client';

import { formatBRL, isInstallmentFinished } from '@/lib/budget';
import { useWallet } from '@/components/wallet/WalletProvider';
import { CardNote, HomeCard, HomeTile, Skeleton, Stat } from './HomeCard';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Recorrentes: how much the templates add up to per month, and how many there are. */
export function RecurringHomeTile() {
  const { snapshot, error } = useWallet();
  return (
    <HomeTile
      module="recurring"
      href="/carteira/recorrentes"
      value={
        snapshot
          ? formatBRL(snapshot.recurring.reduce((total, item) => total + item.amount, 0))
          : error
            ? '—'
            : null
      }
      caption={
        snapshot
          ? `${plural(snapshot.recurring.length, 'modelo', 'modelos')} por mês`
          : error
            ? 'não foi possível carregar'
            : 'carregando…'
      }
    />
  );
}

/** Parcelados: what is still to be paid, and how many purchases are running. */
export function InstallmentsHomeTile() {
  const { snapshot, error } = useWallet();
  const active = snapshot
    ? snapshot.installments.filter((plan) => !isInstallmentFinished(plan, snapshot.today)).length
    : 0;
  return (
    <HomeTile
      module="installments"
      href="/carteira/parcelados"
      value={snapshot ? formatBRL(Math.abs(snapshot.cash.report.installmentDebt)) : error ? '—' : null}
      caption={
        snapshot
          ? `a pagar · ${plural(active, 'compra', 'compras')}`
          : error
            ? 'não foi possível carregar'
            : 'carregando…'
      }
    />
  );
}

/** Reserva investida: what the quotas are worth, and the quote. */
export function InvestmentsHomeTile() {
  const { snapshot, error } = useWallet();
  const investments = snapshot?.investments;
  return (
    <HomeTile
      module="investments"
      href="/carteira/reserva"
      value={
        investments
          ? investments.price === null
            ? 'Sem cotação'
            : formatBRL(investments.totalValue)
          : error
            ? '—'
            : null
      }
      caption={
        investments
          ? investments.price === null
            ? investments.ticker
            : `${investments.ticker} · ${formatBRL(investments.price)}`
          : error
            ? 'não foi possível carregar'
            : 'carregando…'
      }
    />
  );
}

/** Caixa: total reserve, debts and the gap, with how much of the target reserve is covered. */
export function CashHomeCard() {
  const { snapshot, error } = useWallet();

  if (error && !snapshot) {
    return (
      <HomeCard module="cash" href="/carteira/caixa">
        <CardNote tone="danger">{error}</CardNote>
      </HomeCard>
    );
  }

  const report = snapshot?.cash.report;
  const available = report ? report.totalReserve + report.totalDebt : 0;
  const covered =
    report && report.expectedReserve > 0
      ? Math.min(Math.max(available / report.expectedReserve, 0), 1)
      : null;

  return (
    <HomeCard module="cash" href="/carteira/caixa">
      <div>
        <p className="text-muted text-xs font-medium">Reserva total</p>
        {report ? (
          <p className="text-foreground text-2xl font-bold tracking-tight tabular-nums">
            {formatBRL(report.totalReserve)}
          </p>
        ) : (
          <Skeleton className="mt-1 h-7 w-32" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Dívidas"
          value={report ? formatBRL(report.totalDebt) : null}
          tone={report && report.totalDebt < 0 ? 'danger' : undefined}
        />
        <Stat
          label="Gap da reserva"
          value={report ? formatBRL(report.gap) : null}
          tone={report ? (report.gap >= 0 ? 'success' : 'danger') : undefined}
        />
      </div>
      {report && covered !== null && (
        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Reserva prevista coberta"
            aria-valuenow={Math.round(covered * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="bg-border h-2 w-full overflow-hidden rounded-full"
          >
            <div
              className={`h-full rounded-full ${covered >= 1 ? 'bg-success-fill' : 'bg-primary'}`}
              style={{ width: `${covered * 100}%` }}
            />
          </div>
          <p className="text-muted text-xs">
            {Math.round(covered * 100)}% da reserva prevista de {formatBRL(report.expectedReserve)}, já
            descontadas as dívidas
          </p>
        </div>
      )}
    </HomeCard>
  );
}
