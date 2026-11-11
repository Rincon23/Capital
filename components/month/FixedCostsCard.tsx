'use client';

import { useId, useState } from 'react';
import { Info, Plus } from 'lucide-react';
import {
  FIXED_COST_TIP,
  formatBRL,
  resolveSpecialCategoryColors,
  type MonthSummary,
  type SpecialCategoryColors,
  type SpecialCategoryLabels,
} from '@/lib/budget';

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * Fixed and unforeseen costs: how much there is of each and, shown instead of explained, what each
 * category pays of it. With none yet, one sentence with one example — what a bill of R$ 1.000
 * would take from the person's own first category — and the button that adds the first one.
 */
export function FixedCostsCard({
  summary,
  specialCategories,
  specialCategoryColors,
  onAdd,
}: {
  summary: MonthSummary;
  specialCategories: SpecialCategoryLabels;
  specialCategoryColors: Partial<SpecialCategoryColors> | undefined;
  /** Opens the expense form on "Custos Fixos"; without it (a closed month) there is no button. */
  onAdd?: () => void;
}) {
  const colors = resolveSpecialCategoryColors(specialCategoryColors);
  const total = summary.fixedTotal + summary.unforeseenTotal;
  const paying = summary.topics.filter((topic) => topic.proportionalFixed !== 0);
  const [example] = summary.topics.filter((topic) => topic.targetPct > 0);
  // "Quando um gasto é custo fixo?": one tap away, behind the ⓘ.
  const [tipOpen, setTipOpen] = useState(false);
  const tipId = useId();

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-foreground flex items-center gap-2 font-medium">
          <Dot color={colors.fixedCost} />
          {specialCategories.fixedCost}
          <button
            type="button"
            onClick={() => setTipOpen((open) => !open)}
            aria-expanded={tipOpen}
            aria-controls={tipId}
            aria-label="Quando um gasto é custo fixo?"
            title="Quando um gasto é custo fixo?"
            className={`-my-2 -ml-1.5 flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              tipOpen ? 'text-primary' : 'text-muted hover:text-foreground'
            }`}
          >
            <Info aria-hidden className="h-4 w-4" />
          </button>
        </span>
        <span className="text-foreground font-semibold tabular-nums">{formatBRL(summary.fixedTotal)}</span>
      </div>
      <p id={tipId} hidden={!tipOpen} className="bg-background text-muted -mt-1 rounded-lg px-3 py-2 text-xs">
        {FIXED_COST_TIP}
      </p>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-foreground flex items-center gap-2 font-medium">
          <Dot color={colors.unforeseen} />
          {specialCategories.unforeseen}
        </span>
        <span className="text-foreground font-semibold tabular-nums">{formatBRL(summary.unforeseenTotal)}</span>
      </div>

      {total !== 0 ? (
        <div className="border-border border-t pt-3">
          <p className="text-muted mb-2 text-xs">Cada categoria paga a sua parte:</p>
          <ul className="flex flex-col gap-1.5">
            {paying.map((topic) => (
              <li key={topic.topicId} className="flex min-w-0 items-center justify-between gap-2 text-sm">
                <span className="text-muted flex min-w-0 items-center gap-2">
                  <Dot color={topic.color} />
                  <span className="truncate">{topic.name}</span>
                </span>
                <span className="text-foreground shrink-0 tabular-nums">{formatBRL(topic.proportionalFixed)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted border-border border-t pt-3 text-xs">
          Aluguel, contas, consulta. Cada categoria paga a sua parte
          {example ? `: R$ 1.000 tiram ${formatBRL(1000 * example.targetPct)} de ${example.name}.` : '.'}
        </p>
      )}

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="border-border text-foreground hover:bg-background inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-4 text-sm font-medium"
        >
          <Plus aria-hidden className="h-4 w-4" />
          Adicionar custo fixo
        </button>
      )}
    </div>
  );
}
