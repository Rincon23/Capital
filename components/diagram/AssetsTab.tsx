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
  UNQUOTED_LABEL,
  type AssetType,
  type DiagramAsset,
  type DiagramOverview,
  type FixedIncomeType,
} from '@/lib/diagram';
import { diagramRepository } from '@/lib/storage';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { DirectScoreField } from './AssetSheet';
import { formatDate, formatWhen, pct, quotasLabel } from './format';
import { PortfolioChart } from './PortfolioCard';
import { TypeChips } from './TypeChips';

/** Past this many assets the list gets a search field. */
const SEARCH_FROM = 8;

/** The oldest price on screen: what "Cotações de …" says. */
function oldestQuote(overview: DiagramOverview): string | null {
  const times = Object.values(overview.quotes).map((quote) => quote.fetchedAt);
  return times.length > 0 ? times.reduce((oldest, time) => (time < oldest ? time : oldest)) : null;
}

/** The score as a small coloured pill. */
function ScorePill({ score, muted }: { score: number | null; muted?: boolean }) {
  const tone =
    muted || score === null
      ? 'bg-background text-muted'
      : score > 0
        ? 'bg-success-bg text-success'
        : 'bg-danger-bg text-danger';
  return (
    <span
      className={`min-w-[2.75rem] shrink-0 rounded-full px-2 py-1 text-center text-sm font-semibold tabular-nums ${tone}`}
    >
      {formatScore(score)}
    </span>
  );
}

/** One line of the list: what it is, what it is worth, its score. */
function Row({
  title,
  badge,
  subtitle,
  value,
  score,
  stopped,
  onClick,
}: {
  title: string;
  badge?: string;
  subtitle?: string;
  value: string;
  score: number | null;
  stopped?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span
            className={`flex items-center gap-1.5 font-semibold ${stopped ? 'text-muted' : 'text-foreground'}`}
          >
            <span className="truncate">{title}</span>
            {badge && (
              <span className="bg-background text-muted rounded px-1.5 py-0.5 text-[10px] font-semibold">
                {badge}
              </span>
            )}
          </span>
          {(subtitle || stopped) && (
            <span className="text-muted block truncate text-xs">
              {stopped ? 'Não compro mais' : subtitle}
              {stopped && subtitle ? ` · ${subtitle}` : ''}
            </span>
          )}
        </span>
        <span className="text-foreground shrink-0 text-sm tabular-nums">{value}</span>
        <ScorePill score={score} muted={stopped} />
      </button>
    </li>
  );
}

/**
 * "Ativos e notas": the portfolio by type, the filters and, per type, one card with a line per
 * asset (value and score; "Não compro mais" and the rest live in the asset's sheet). Fixed income
 * has its total without a quote (Tesouro, CDB, LCI…) plus the funds with a ticker (DEBB11).
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
  const search = query.trim().toUpperCase();
  const visibleTypes = inUse.filter((type) => filter === null || filter === type);
  const hidden = overview.assets.filter((asset) => !inUse.includes(asset.type)).length;
  const quotedAt = oldestQuote(overview);

  async function refresh() {
    setRefreshing(true);
    try {
      const { missing } = await diagramRepository.refreshQuotes();
      await onChanged();
      showToast(
        missing.length > 0 ? `Sem cotação agora: ${missing.join(', ')}.` : 'Cotações atualizadas.',
        missing.length > 0 ? 'info' : 'success',
      );
    } catch {
      showToast('Não foi possível atualizar as cotações.', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
        <PortfolioChart overview={overview} />
        {inUse.length === 0 && (
          <button
            type="button"
            onClick={onOpenTargets}
            className="text-primary self-start text-sm font-semibold"
          >
            Escolher tipos e metas
          </button>
        )}
      </section>

      <div className="flex items-center gap-2 px-4">
        <button
          type="button"
          onClick={onAddAsset}
          className="bg-primary text-primary-foreground flex min-h-[44px] items-center gap-1.5 rounded-lg px-4 text-sm font-semibold"
        >
          <Plus aria-hidden className="h-4 w-4" />
          Ativo
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
          title={quotedAt ? `Cotações de ${formatWhen(quotedAt)}` : 'Atualizar cotações'}
          className="text-muted ml-auto flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs disabled:opacity-40"
        >
          {quotedAt && <span className="tabular-nums">{formatWhen(quotedAt)}</span>}
          <RefreshCw aria-hidden className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {inUse.length > 1 && (
        <div className="px-4">
          <TypeChips
            types={inUse}
            selected={filter}
            onSelect={setFilter}
            all={{ label: 'Todos', onSelect: () => setFilter(null) }}
          />
        </div>
      )}

      {overview.assets.length > SEARCH_FROM && (
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
          const fixed = isFixedIncomeType(type);
          const assets = overview.assets
            .filter((asset) => asset.type === type)
            .filter(
              (asset) =>
                !search ||
                asset.ticker.includes(search) ||
                (overview.quotes[asset.id]?.name ?? '').toUpperCase().includes(search),
            );
          const showUnquoted = fixed && (!search || UNQUOTED_LABEL.toUpperCase().includes(search));
          if (search && assets.length === 0 && !showUnquoted) return null;

          const unquoted = fixed ? fixedIncomeAmount(overview, type as FixedIncomeType) : 0;
          const inType =
            unquoted +
            overview.assets
              .filter((asset) => asset.type === type)
              .reduce((sum, asset) => sum + assetValue(asset, overview), 0);
          const total = overview.fixedIncome.find((item) => item.type === type);
          return (
            <div key={type} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 px-1">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: definition.color }}
                />
                <h3 className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
                  {definition.label}
                </h3>
                <span className="text-muted text-xs tabular-nums">
                  {inType > 0 ? `${formatBRL(inType)} · ` : ''}meta{' '}
                  {pct(overview.settings.targets[type] ?? 0)}
                </span>
              </div>
              {assets.length === 0 && !showUnquoted ? (
                <p className="text-muted px-1 text-sm">Nenhum ativo ainda.</p>
              ) : (
                <ul className="border-border bg-card divide-border divide-y rounded-xl border shadow-sm">
                  {showUnquoted && (
                    <Row
                      title={UNQUOTED_LABEL}
                      subtitle={
                        total?.updatedOn
                          ? `Tesouro, CDB, LCI… · ${formatDate(total.updatedOn)}`
                          : 'Tesouro, CDB, LCI…'
                      }
                      value={formatBRL(unquoted)}
                      score={total?.score ?? 1}
                      onClick={() => setEditingFixed(type as FixedIncomeType)}
                    />
                  )}
                  {assets.map((asset) => {
                    const quote = overview.quotes[asset.id];
                    const value = assetValue(asset, overview);
                    const parts = [
                      asset.quantity > 0 ? quotasLabel(asset.quantity, asset.type) : '',
                      value > 0 && inType > 0 ? `${pct(value / inType)} do tipo` : '',
                      quote ? '' : 'sem cotação',
                    ].filter(Boolean);
                    return (
                      <Row
                        key={asset.id}
                        title={asset.ticker}
                        badge={asset.isEtf && !fixed ? 'ETF' : undefined}
                        subtitle={parts.join(' · ') || undefined}
                        value={value > 0 ? formatBRL(value) : '—'}
                        score={scoreOf(asset, overview).score}
                        stopped={asset.stopBuying}
                        onClick={() => onOpenAsset(asset)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {inUse.length > 0 && overview.assets.length === 0 && (
          <p className="text-muted text-center text-sm">Nenhum ativo ainda. Toque em + Ativo.</p>
        )}
        {hidden > 0 && (
          <p className="text-muted text-xs">
            {hidden === 1 ? '1 ativo guardado' : `${hidden} ativos guardados`} em tipos fora da carteira.{' '}
            <button type="button" onClick={onOpenTargets} className="text-primary font-semibold">
              Tipos e metas
            </button>
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

/**
 * What a fixed-income type holds without a quote (Tesouro Direto, CDB, LCI, LCA…), summed up, and
 * its score — how it shares the type with the funds that have a ticker.
 */
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
  const [score, setScore] = useState(current?.score ?? 1);
  const [saving, setSaving] = useState(false);

  return (
    <BottomSheet open title={`${UNQUOTED_LABEL} · ${assetType(type).shortLabel}`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await diagramRepository.setFixedIncome(
              type,
              Math.max(0, parseAmountInput(amount)),
              todayISO(),
              score,
            );
            await onSaved();
            showToast('Salvo.');
          } catch {
            showToast('Não foi possível salvar.', 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        <p className="text-muted text-sm">
          Tesouro, CDB, LCI, LCA: o que não tem cotação. Fundo com código (DEBB11) entra como ativo.
        </p>
        <AmountInput value={amount} onChange={setAmount} autoFocus label="Valor total" />
        {current?.updatedOn && (
          <p className="text-muted -mt-2 text-xs">Atualizado em {formatDate(current.updatedOn)}.</p>
        )}
        <DirectScoreField value={score} onChange={(value) => setScore(Math.round(value * 100) / 100)} />
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
