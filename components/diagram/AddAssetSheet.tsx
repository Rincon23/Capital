'use client';

import { useEffect, useRef, useState } from 'react';
import { parseAmountInput, todayISO } from '@/lib/budget';
import {
  assetType,
  isFixedIncomeType,
  normalizeAssetTicker,
  typesInUse,
  type DiagramAsset,
  type DiagramOverview,
  type TickerType,
} from '@/lib/diagram';
import { diagramRepository, type TickerSuggestion } from '@/lib/storage';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

/** How long the field waits after the last key before asking for suggestions. */
const SEARCH_DELAY_MS = 300;

/**
 * "Adicionar ativo": first the type (the chips of the portfolio's types), then the ticker with
 * suggestions while typing, and the quantity. The answers come next, in the asset's own sheet,
 * which opens right after.
 */
export function AddAssetSheet({
  overview,
  initialType,
  onClose,
  onAdded,
}: {
  overview: DiagramOverview;
  initialType?: TickerType;
  onClose: () => void;
  onAdded: (asset: DiagramAsset) => Promise<void>;
}) {
  const { showToast } = useToast();
  const types = typesInUse(overview.settings.targets).filter(
    (key): key is TickerType => !isFixedIncomeType(key),
  );
  const [type, setType] = useState<TickerType | null>(
    initialType && types.includes(initialType) ? initialType : (types[0] ?? null),
  );
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [isEtf, setIsEtf] = useState(false);
  const [chosen, setChosen] = useState<TickerSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const request = useRef(0);

  const market = type ? (assetType(type).market ?? 'b3') : 'b3';
  const normalized = type ? normalizeAssetTicker(market, ticker) : '';

  useEffect(() => {
    if (!type || normalized.length < 1 || chosen?.ticker === normalized) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    const id = ++request.current;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await diagramRepository.searchTickers(type, normalized);
        if (request.current === id) setSuggestions(found);
      } catch {
        if (request.current === id) setSuggestions([]);
      } finally {
        if (request.current === id) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [type, normalized, chosen]);

  function choose(suggestion: TickerSuggestion) {
    setChosen(suggestion);
    setTicker(suggestion.ticker);
    setIsEtf(suggestion.isEtf);
    setSuggestions([]);
  }

  const duplicate = !!type && overview.assets.some((asset) => asset.type === type && asset.ticker === normalized);

  if (types.length === 0) {
    return (
      <BottomSheet open title="Adicionar ativo" onClose={onClose}>
        <p className="text-muted text-sm">
          Primeiro escolha os tipos da sua carteira na engrenagem (Tipos e metas). A renda fixa não precisa de
          ativo: ela é um valor total, atualizado no aporte.
        </p>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open title="Adicionar ativo" onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!type || !normalized || duplicate) return;
          setSaving(true);
          try {
            const asset = await diagramRepository.addAsset(
              {
                type,
                ticker: normalized,
                quantity: Math.max(0, parseAmountInput(quantity)),
                stopBuying: false,
                isEtf,
                directScore: null,
              },
              todayISO(),
            );
            await onAdded(asset);
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Não foi possível adicionar.', 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <span className="text-muted text-sm font-medium">Tipo</span>
          <div className="flex flex-wrap gap-2">
            {types.map((key) => {
              const definition = assetType(key);
              const selected = key === type;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setType(key);
                    setChosen(null);
                  }}
                  className={`flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${
                    selected ? 'text-foreground' : 'border-border text-muted'
                  }`}
                  style={selected ? { borderColor: definition.color, background: `color-mix(in srgb, ${definition.color} 14%, transparent)` } : undefined}
                >
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: definition.color }} />
                  {definition.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative flex flex-col gap-1.5">
          <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
            Código do ativo
            <input
              type="text"
              value={ticker}
              onChange={(event) => {
                setTicker(event.target.value.toUpperCase());
                setChosen(null);
              }}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={type ? `Ex.: ${assetType(type).example}` : ''}
              className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base uppercase outline-none focus:ring-2"
            />
          </label>
          {chosen?.name && <p className="text-muted text-xs">{chosen.name}</p>}
          {duplicate && <p className="text-danger text-xs">{normalized} já está na sua carteira, nesse tipo.</p>}
          {suggestions.length > 0 && (
            <ul className="border-border bg-card flex flex-col overflow-hidden rounded-lg border" role="listbox">
              {suggestions.map((suggestion) => (
                <li key={suggestion.ticker}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => choose(suggestion)}
                    className="hover:bg-background flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left"
                  >
                    <span className="text-foreground font-semibold">{suggestion.ticker}</span>
                    <span className="text-muted min-w-0 flex-1 truncate text-xs">{suggestion.name}</span>
                    {suggestion.isEtf && (
                      <span className="bg-background text-muted rounded-full px-2 py-0.5 text-[10px] font-semibold">ETF</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searching && suggestions.length === 0 && normalized && !chosen && (
            <p className="text-muted text-xs">Procurando…</p>
          )}
        </div>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Quantidade de cotas que você tem
          <input
            type="text"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="0"
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
          {type && assetType(type).fractionDigits > 0 && (
            <span className="text-muted text-xs font-normal">Aceita fração, como 0,5 ou 1,8634.</span>
          )}
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-foreground text-sm font-medium">É um ETF</span>
            <span className="text-muted text-xs">ETF não responde perguntas: recebe uma nota direta.</span>
          </span>
          <Switch checked={isEtf} onChange={setIsEtf} label="É um ETF" />
        </div>

        <button
          type="submit"
          disabled={saving || !type || !normalized || duplicate}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Adicionando…' : 'Adicionar e dar a nota'}
        </button>
      </form>
    </BottomSheet>
  );
}
