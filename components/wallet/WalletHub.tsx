import Link from 'next/link';
import { ChevronRight, LayoutGrid, type LucideIcon } from 'lucide-react';
import { formatBRL } from '@/lib/budget';
import { IconTile, type IconTone } from '@/components/ui/IconTile';

export interface WalletHubTile {
  key: string;
  href: string;
  icon: LucideIcon;
  tone: IconTone;
  title: string;
  /** The one number that says how this area is doing; null while it is loading. */
  value: string | null;
  valueTone?: 'danger' | 'success';
  caption: string;
}

export interface WalletHubOverview {
  totalReserve: number;
  totalDebt: number;
  gap: number;
  expectedReserve: number;
}

/**
 * The Carteira tab, as a dashboard: an overview of reserve against debts (when the Caixa module
 * is on) and one tile per module, each with its own icon and colour. Purely presentational —
 * `CarteiraScreen` feeds it from the wallet snapshot.
 */
export function WalletHub({
  tiles,
  overview,
}: {
  tiles: WalletHubTile[];
  overview: WalletHubOverview | null;
}) {
  if (tiles.length === 0) {
    return (
      <div className="border-border bg-card mx-4 flex flex-col items-center gap-3 rounded-2xl border p-6 text-center shadow-sm">
        <IconTile icon={LayoutGrid} tone="neutral" size="lg" />
        <p className="text-foreground font-semibold">Nenhum módulo da Carteira ligado</p>
        <p className="text-muted text-sm">
          Gastos recorrentes, parcelados, reserva investida e caixa ficam aqui. Ligue os que você
          quiser usar.
        </p>
        <Link
          href="/configuracoes"
          className="bg-primary text-primary-foreground flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold"
        >
          Abrir Configurações
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4">
      {overview && <Overview overview={overview} />}

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile, index) => (
          <Link
            key={tile.key}
            href={tile.href}
            className={`border-border bg-card hover:border-primary/40 flex min-h-[136px] flex-col justify-between gap-3 rounded-2xl border p-4 shadow-sm transition active:scale-[0.98] ${
              tiles.length % 2 === 1 && index === tiles.length - 1 ? 'col-span-2' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <IconTile icon={tile.icon} tone={tile.tone} />
              <ChevronRight aria-hidden className="text-muted h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-muted text-xs font-medium">{tile.title}</p>
              {tile.value === null ? (
                <span className="bg-border mt-1 block h-5 w-24 animate-pulse rounded" />
              ) : (
                <p
                  className={`truncate text-lg leading-tight font-semibold ${
                    tile.valueTone === 'danger'
                      ? 'text-danger'
                      : tile.valueTone === 'success'
                        ? 'text-success'
                        : 'text-foreground'
                  }`}
                >
                  {tile.value}
                </p>
              )}
              <p className="text-muted mt-0.5 truncate text-xs">{tile.caption}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Reserve, debts and gap at a glance, with how much of the target reserve is already covered. */
function Overview({ overview }: { overview: WalletHubOverview }) {
  const available = overview.totalReserve + overview.totalDebt;
  const covered =
    overview.expectedReserve > 0 ? Math.min(Math.max(available / overview.expectedReserve, 0), 1) : null;

  return (
    <Link
      href="/carteira/caixa"
      className="border-border bg-card hover:border-primary/40 flex flex-col gap-4 rounded-2xl border p-4 shadow-sm transition"
    >
      <div>
        <p className="text-muted text-xs font-medium">Reserva total</p>
        <p className="text-foreground text-3xl font-bold tracking-tight">
          {formatBRL(overview.totalReserve)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-background rounded-xl px-3 py-2">
          <p className="text-muted text-xs">Dívidas</p>
          <p
            className={`text-sm font-semibold ${overview.totalDebt < 0 ? 'text-danger' : 'text-foreground'}`}
          >
            {formatBRL(overview.totalDebt)}
          </p>
        </div>
        <div className="bg-background rounded-xl px-3 py-2">
          <p className="text-muted text-xs">Gap da reserva</p>
          <p className={`text-sm font-semibold ${overview.gap >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatBRL(overview.gap)}
          </p>
        </div>
      </div>

      {covered !== null && (
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
            {Math.round(covered * 100)}% da reserva prevista de {formatBRL(overview.expectedReserve)},
            já descontadas as dívidas
          </p>
        </div>
      )}
    </Link>
  );
}
