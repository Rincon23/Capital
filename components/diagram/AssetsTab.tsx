'use client';

import { useState } from 'react';
import { ListChecks, Plus, RefreshCw, Search } from 'lucide-react';
import { amountToInputValue, formatBRL, parseAmountInput, todayISO } from '@/lib/budget';
import {
  assetType,
  assetValue,
  fixedIncomeAmount,
  formatScore,
  isFixedIncomeType,
  scoreOf,
  typesInUse,
  type AssetType,
  type DiagramAsset,
  type DiagramOverview,
  type FixedIncomeType,
} from '@/lib/diagram';
import { diagramRepository } from '@/lib/storage';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatQuantity, formatWhen, pct } from './format';
import { PortfolioChart } from './PortfolioCard';
import { TypeChips } from './TypeChips';

/** The oldest price on screen: what "Cotações de …" says. */
function oldestQuote(overview: DiagramOverview): string | null {
  const times = Object.values(overview.quotes).map((quote) => quote.fetchedAt);
  return times.length > 0 ? times.reduce((oldest, time) => (time < oldest ? time : oldest)) : null;
}

/**
 * "Ativos e notas": the portfolio by type, the filters (a coloured chip per type) and the search,
 * and every asset with its value, its share inside the type, its score, its quantity and when it
 * last changed — plus "Não compro mais" right on the line. Fixed income is one total per type.
 */
export function AssetsTab({
  overview,
  onOpenAsset,
  onAddAsset,
  onOpenQuestions,
  onOpenTargets,
  onChanged,
}: {
  overview: DiagramOverview;
  onOpenAsset: (asset: DiagramAsset) => void;
  onAddAsset: () => void;
  onOpenQuestions: () => void;
  onOpenTargets: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<AssetType | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [editingFixed, setEditingFixed] = useState<FixedIncomeType | null>(null);

  const inUse = typesInUse(overview.settings.targets);
  const filters = inUse.filter((type) => (overview.settings.targets[type] ?? 0) > 0);
  const search = query.trim().toUpperCase();
  const visibleTypes = inUse.filter((type) => filter === null || filter === type);
  const hidden = overview.assets.filter((asset) => !inUse.includes(asset.type)).length;
  const quotedAt = oldestQuote(overview);

  const typeTotal = (type: AssetType) =>
    overview.assets.filter((asset) => asset.type === type).reduce((sum, asset) => sum + assetValue(asset, overview), 0);

  async function refresh() {
    setRefreshing(true);
    try {
      const { missing } = await diagramRepository.refreshQuotes();
      await onChanged();
      showToast(missing.length > 0 ? `Sem cotação agora: ${missing.join(', ')}.` : 'Cotações atualizadas.', missing.length > 0 ? 'info' : 'success');
    } catch {
      showToast('Não foi possível atualizar as cotações.', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleStop(asset: DiagramAsset, stopBuying: boolean) {
    try {
      await diagramRepository.setStopBuying(asset.id, stopBuying);
      await onChanged();
      showToast(
        stopBuying
          ? `${asset.ticker}: não compro mais. Ele fica na carteira e nunca é sugerido.`
          : `${asset.ticker} volta a receber aporte, com a nota de antes.`,
      );
    } catch {
      showToast('Não foi possível salvar.', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
        <PortfolioChart overview={overview} />
        {inUse.length === 0 && (
          <button type="button" onClick={onOpenTargets} className="text-primary self-start text-sm font-semibold">
            Escolher tipos e metas
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 px-4">
        <button
          type="button"
          onClick={onAddAsset}
          className="bg-primary text-primary-foreground flex min-h-[44px] items-center gap-1.5 rounded-lg px-4 text-sm font-semibold"
        >
          <Plus aria-hidden className="h-4 w-4" />
          Adicionar ativo
        </button>
        <button
          type="button"
          onClick={onOpenQuestions}
          data-tour="diagrama-perguntas"
          className="border-border text-foreground flex min-h-[44px] items-center gap-1.5 rounded-lg border px-4 text-sm font-medium"
        >
          <ListChecks aria-hidden className="h-4 w-4" />
          Perguntas
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || overview.assets.length === 0}
          aria-label="Atualizar cotações"
          title="Atualizar cotações"
          className="border-border text-foreground ml-auto flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-40"
        >
          <RefreshCw aria-hidden className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {quotedAt && (
        <p className="text-muted -mt-1 px-4 text-xs">
          Cotações de {formatWhen(quotedAt)} (B3 e Yahoo Finance)
          {overview.dollar ? ` · dólar ${formatBRL(overview.dollar.price)}` : ''}
        </p>
      )}

      {filters.length > 1 && (
        <div className="px-4">
          <TypeChips
            types={filters}
            selected={filter}
            onSelect={setFilter}
            all={{ label: 'Todos', onSelect: () => setFilter(null) }}
          />
        </div>
      )}

      {overview.assets.length > 0 && (
        <label className="border-border bg-card focus-within:ring-primary mx-4 flex min-h-[44px] items-center gap-2 rounded-lg border px-3 focus-within:ring-2">
          <Search aria-hidden className="text-muted h-4 w-4" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar ativo"
            className="text-foreground w-full bg-transparent text-base outline-none"
          />
        </label>
      )}

      <section className="flex flex-col gap-4 px-4" data-tour="diagrama-ativos">
        {visibleTypes.map((type) => {
          const definition = assetType(type);
          if (isFixedIncomeType(type)) {
            if (search && !definition.label.toUpperCase().includes(search)) return null;
            const total = overview.fixedIncome.find((item) => item.type === type);
            return (
              <div key={type} className="flex flex-col gap-2">
                <TypeHeader type={type} value={fixedIncomeAmount(overview, type)} target={overview.settings.targets[type] ?? 0} />
                <button
                  type="button"
                  onClick={() => setEditingFixed(type)}
                  className="border-border bg-card flex items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block font-medium">Valor total</span>
                    <span className="text-muted block text-xs">
                      {total?.updatedOn ? `Atualizado em ${formatDate(total.updatedOn)}` : 'Ainda não informado'} · toque para
                      mudar
                    </span>
                  </span>
                  <span className="text-foreground font-semibold tabular-nums">{formatBRL(total?.amount ?? 0)}</span>
                </button>
              </div>
            );
          }

          const assets = overview.assets
            .filter((asset) => asset.type === type)
            .filter((asset) => !search || asset.ticker.includes(search) || (overview.quotes[asset.id]?.name ?? '').toUpperCase().includes(search));
          if (search && assets.length === 0) return null;
          const inType = typeTotal(type);
          return (
            <div key={type} className="flex flex-col gap-2">
              <TypeHeader type={type} value={inType} target={overview.settings.targets[type] ?? 0} />
              {assets.length === 0 ? (
                <p className="text-muted text-sm">Nenhum ativo de {definition.label} ainda.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {assets.map((asset) => {
                    const value = assetValue(asset, overview);
                    const score = scoreOf(asset, overview).score;
                    const quote = overview.quotes[asset.id];
                    return (
                      <li key={asset.id} className={`border-border bg-card rounded-xl border shadow-sm ${asset.stopBuying ? 'opacity-75' : ''}`}>
                        <button type="button" onClick={() => onOpenAsset(asset)} className="flex w-full items-start gap-3 px-4 pt-3 pb-2 text-left">
                          <span className="min-w-0 flex-1">
                            <span className="text-foreground flex items-center gap-1.5 font-semibold">
                              {asset.ticker}
                              {asset.isEtf && (
                                <span className="bg-background text-muted rounded-full px-1.5 py-0.5 text-[10px] font-semibold">ETF</span>
                              )}
                            </span>
                            <span className="text-muted block truncate text-xs">
                              {formatQuantity(asset.quantity, asset.type)} cotas · atualizado em {formatDate(asset.quantityUpdatedOn)}
                            </span>
                            {(asset.sector || asset.subsector) && (
                              <span className="text-muted block truncate text-xs">
                                {[asset.sector, asset.subsector].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 flex-col items-end">
                            <span className="text-foreground font-semibold tabular-nums">{quote ? formatBRL(value) : 'sem cotação'}</span>
                            <span className="text-muted text-xs tabular-nums">{inType > 0 ? `${pct(value / inType)} do tipo` : '—'}</span>
                          </span>
                          <ScoreBadge score={score} stopped={asset.stopBuying} />
                        </button>
                        <label className="border-border text-muted flex min-h-[40px] items-center gap-2 border-t px-4 text-xs">
                          <input
                            type="checkbox"
                            checked={asset.stopBuying}
                            onChange={(event) => void toggleStop(asset, event.target.checked)}
                            className="accent-primary h-4 w-4"
                          />
                          Não compro mais
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {inUse.length > 0 && overview.assets.length === 0 && (
          <p className="text-muted text-center text-sm">
            Nenhum ativo ainda. Toque em Adicionar ativo e depois responda as perguntas dele.
          </p>
        )}
        {hidden > 0 && (
          <p className="text-muted text-xs">
            {hidden === 1 ? '1 ativo está guardado' : `${hidden} ativos estão guardados`} em tipos que você tirou da
            carteira. Eles voltam quando o tipo for adicionado de novo, em{' '}
            <button type="button" onClick={onOpenTargets} className="text-primary font-semibold">
              Tipos e metas
            </button>
            .
          </p>
        )}
      </section>

      {editingFixed && (
        <FixedIncomeSheet
          overview={overview}
          type={editingFixed}
          onClose={() => setEditingFixed(null)}
          onSaved={async () => {
            await onChanged();
            setEditingFixed(null);
          }}
        />
      )}
    </div>
  );
}

function TypeHeader({ type, value, target }: { type: AssetType; value: number; target: number }) {
  const definition = assetType(type);
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: definition.color }} />
      <h3 className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">{definition.label}</h3>
      <span className="text-muted text-xs tabular-nums">
        {formatBRL(value)} · meta {pct(target)}
      </span>
    </div>
  );
}

function ScoreBadge({ score, stopped }: { score: number | null; stopped: boolean }) {
  const tone =
    stopped || score === null
      ? 'bg-background text-muted'
      : score > 0
        ? 'bg-success-bg text-success'
        : 'bg-danger-bg text-danger';
  return (
    <span className={`flex w-12 shrink-0 flex-col items-center rounded-lg px-1 py-1 ${tone}`}>
      <span className="text-[9px] font-semibold uppercase">Nota</span>
      <span className="text-sm font-semibold tabular-nums">{formatScore(score)}</span>
    </span>
  );
}

/** The single total of a fixed-income type: the person changes only this number. */
export function FixedIncomeSheet({
  overview,
  type,
  onClose,
  onSaved,
}: {
  overview: DiagramOverview;
  type: FixedIncomeType;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const current = overview.fixedIncome.find((item) => item.type === type);
  const [amount, setAmount] = useState(current ? amountToInputValue(current.amount) : '');
  const [saving, setSaving] = useState(false);

  return (
    <BottomSheet open title={assetType(type).label} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await diagramRepository.setFixedIncome(type, Math.max(0, parseAmountInput(amount)), todayISO());
            await onSaved();
            showToast('Valor salvo.');
          } catch {
            showToast('Não foi possível salvar.', 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        <p className="text-muted text-sm">
          Quanto você tem hoje em {assetType(type).label.toLowerCase()}, somando tudo. É um valor só: não precisa
          cadastrar cada título.
        </p>
        <AmountInput value={amount} onChange={setAmount} autoFocus label="Valor total" />
        {current?.updatedOn && <p className="text-muted text-xs">Último valor salvo em {formatDate(current.updatedOn)}.</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </BottomSheet>
  );
}
