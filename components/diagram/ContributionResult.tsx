'use client';

import { useMemo, useState } from 'react';
import { Check, Info, Minus, Plus, RotateCcw } from 'lucide-react';
import { amountToInputValue, currentMonthKey, formatBRL, parseAmountInput, todayISO } from '@/lib/budget';
import {
  assetType,
  buildPlan,
  sharesAfter,
  stepQuantity,
  suggestQuantities,
  type BlockReason,
  type DiagramOverview,
  type OrphanReason,
  type Plan,
  type PlanInput,
  type PlanLine,
} from '@/lib/diagram';
import { diagramRepository } from '@/lib/storage';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { Donut } from './Donut';
import { formatQuantity, pct, quotasLabel } from './format';

const BLOCK_TEXT: Record<BlockReason, string> = {
  stopped: 'Não compro mais',
  noScore: 'Sem nota: responda as perguntas dele',
  lowScore: 'Nota 0 ou menor',
  noPrice: 'Sem cotação',
  typeOff: 'O tipo está com meta 0%',
  typeRedistributed: 'O tipo não recebe neste aporte',
  atTarget: 'Já está na meta',
  waiting: 'Fica para o próximo aporte: outros estão mais longe da meta',
};

const ORPHAN_TEXT: Record<OrphanReason, string> = {
  empty: 'não tem nenhum ativo cadastrado',
  stopped: 'todos os ativos estão com "Não compro mais"',
  noScore: 'nenhum ativo tem nota ainda',
  lowScore: 'nenhum ativo tem nota acima de 0',
  noPrice: 'nenhum ativo tem cotação agora',
  mixed: 'nenhum ativo pode receber (sem nota acima de 0 ou sem cotação)',
};

/** Why the leftover is there, in a sentence. */
function leftoverText(plan: Plan): string {
  const left = formatBRL(plan.leftover);
  const reason = plan.leftoverReason;
  switch (reason.kind) {
    case 'none':
      return 'Todo o valor tem destino.';
    case 'quotaTooExpensive':
      return `${left} não compram uma cota de ${reason.label} (${formatBRL(reason.price)}). Fica para o próximo aporte.`;
    case 'allAtTarget':
      return `Todos os ativos que podem receber chegaram na meta: ${left} ficam para o próximo aporte.`;
    case 'noReceivers':
      return `Nenhum ativo pode receber agora (veja os avisos acima): ${left} ficam sem destino. Dê nota aos ativos ou adicione ativos aos tipos.`;
    case 'unspent':
      return `${left} ainda sem destino. Use o + em algum ativo ou toque em Refazer sugestão.`;
  }
}

/** "1,2% → 1,8% · meta 2%" of a line, on the portfolio before and after. */
function lineShares(line: PlanLine, plan: Plan): string {
  const before = plan.invested > 0 ? line.value / plan.invested : 0;
  const after = plan.invested + plan.spent > 0 ? (line.value + line.amount) / (plan.invested + plan.spent) : 0;
  const target = plan.invested + plan.amount > 0 ? line.target / (plan.invested + plan.amount) : 0;
  return `${pct(before)} → ${pct(after)} · meta ${pct(target)}`;
}

/** What a line buys, in words. */
function lineQuantity(line: PlanLine): string {
  if (line.unit === 'money') return 'valor em reais';
  return `${quotasLabel(line.quantity, line.type)} × ${formatBRL(line.price ?? 0)}`;
}

/**
 * The result of an aporte: a donut with where the money goes (or the portfolio after it), the
 * leftover always in sight and explained, each type with its assets — quotas and R$ with − / +,
 * % today → after → target, "Aportar" on the line — and "Aportar tudo".
 */
export function ContributionResult({
  basis,
  launchAvailable,
  onChanged,
}: {
  basis: { input: PlanInput; overview: DiagramOverview };
  /** Lançamentos is on: "Lançar em Investimentos" can be offered. */
  launchAvailable: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const suggested = useMemo(() => suggestQuantities(basis.input), [basis.input]);
  const [quantities, setQuantities] = useState<Record<string, number>>(suggested);
  const [done, setDone] = useState<string[]>([]);
  const [view, setView] = useState<'aporte' | 'depois'>('aporte');
  const [contributing, setContributing] = useState<PlanLine | 'all' | null>(null);

  const plan = useMemo(() => buildPlan(basis.input, quantities), [basis.input, quantities]);
  const receivingTypes = plan.types.filter((type) => type.target > 0 && !type.orphan);
  const orphans = plan.types.filter((type) => type.orphan);
  const stopped = plan.lines.filter((line) => line.blocked === 'stopped');
  const pending = plan.lines.filter((line) => !done.includes(line.id) && !line.blocked && line.quantity > 0);
  const after = sharesAfter(plan);

  function adjust(line: PlanLine, direction: 1 | -1) {
    setQuantities((current) => ({ ...current, [line.id]: stepQuantity(line, direction, plan.leftover) }));
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-foreground font-semibold">Resultado</h2>
          <div role="tablist" className="bg-background flex gap-1 rounded-lg p-1 text-xs">
            {(
              [
                ['aporte', 'Distribuição do aporte'],
                ['depois', 'Carteira depois'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`rounded-md px-2 py-1.5 font-semibold ${view === key ? 'bg-card text-foreground shadow-sm' : 'text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {view === 'aporte' ? (
            <Donut
              label="Distribuição do aporte por tipo"
              slices={plan.types.map((type) => ({ key: type.type, value: type.amount, color: assetType(type.type).color }))}
              size={120}
            >
              <span className="text-muted text-[10px]">Aporte</span>
              <span className="text-foreground text-xs font-semibold tabular-nums">{formatBRL(plan.spent)}</span>
            </Donut>
          ) : (
            <Donut
              label="Carteira depois do aporte: anel de fora é depois, anel de dentro é a meta"
              slices={after.map((item) => ({ key: item.type, value: item.share, color: assetType(item.type).color }))}
              inner={plan.types.map((type) => ({ key: type.type, value: type.target, color: assetType(type.type).color }))}
              size={120}
            >
              <span className="text-muted text-[10px]">Depois</span>
              <span className="text-foreground text-xs font-semibold tabular-nums">
                {formatBRL(plan.invested + plan.spent)}
              </span>
            </Donut>
          )}
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
            {plan.types
              .filter((type) => (view === 'aporte' ? type.amount > 0 : true))
              .map((type) => {
                const share = after.find((item) => item.type === type.type)?.share ?? 0;
                return (
                  <li key={type.type} className="flex items-center gap-2">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: assetType(type.type).color }} />
                    <span className="text-foreground min-w-0 flex-1 truncate">{assetType(type.type).shortLabel}</span>
                    <span className="text-foreground tabular-nums">
                      {view === 'aporte' ? formatBRL(type.amount) : `${pct(share)} · meta ${pct(type.target)}`}
                    </span>
                  </li>
                );
              })}
            {view === 'aporte' && plan.spent === 0 && <li className="text-muted">Nada comprado.</li>}
          </ul>
        </div>
      </section>

      <section
        className={`mx-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
          plan.leftover >= 0.01 ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'
        }`}
        aria-live="polite"
      >
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Sobra: {formatBRL(Math.max(0, plan.leftover))}.</strong> {leftoverText(plan)}
        </span>
      </section>

      {orphans.map((type) => (
        <p key={type.type} className="bg-background text-foreground mx-4 rounded-xl px-4 py-3 text-sm">
          <strong>{assetType(type.type).label}</strong>: {ORPHAN_TEXT[type.orphan as OrphanReason]}. A meta dele (
          {pct(type.target)}) foi dividida entre os outros tipos, na proporção das metas.
        </p>
      ))}

      {receivingTypes.map((type) => {
        const lines = plan.lines.filter((line) => line.type === type.type && line.blocked !== 'stopped');
        // The lines the suggestion bought (or the person added to) stay as full lines, even at 0.
        const buying = lines.filter(
          (line) => (suggested[line.id] ?? 0) > 0 || line.quantity > 0 || done.includes(line.id),
        );
        const idle = lines.filter((line) => !buying.includes(line));
        const before = plan.invested > 0 ? type.value / plan.invested : 0;
        const afterShare = after.find((item) => item.type === type.type)?.share ?? 0;
        return (
          <section key={type.type} className="mx-4 flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span aria-hidden className="h-2.5 w-2.5 self-center rounded-full" style={{ background: assetType(type.type).color }} />
              <h3 className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">{assetType(type.type).label}</h3>
              <span className="text-foreground text-sm font-semibold tabular-nums">{formatBRL(type.amount)}</span>
            </div>
            <p className="text-muted -mt-1 text-xs">
              {pct(before)} → {pct(afterShare)} · meta {pct(type.effectiveTarget)}
              {Math.abs(type.effectiveTarget - type.target) > 0.0001 ? ` (sua meta: ${pct(type.target)})` : ''}
            </p>
            <ul className="flex flex-col gap-2">
              {buying.map((line) => (
                <li key={line.id} className="border-border bg-card flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground font-semibold">{line.unit === 'money' ? 'Valor total' : line.label}</p>
                      <p className="text-muted text-xs">{lineQuantity(line)}</p>
                      <p className="text-muted text-xs tabular-nums">{lineShares(line, plan)}</p>
                    </div>
                    <p className="text-foreground font-semibold tabular-nums">{formatBRL(line.amount)}</p>
                  </div>
                  {done.includes(line.id) ? (
                    <p className="text-success flex items-center gap-1 text-sm font-semibold">
                      <Check aria-hidden className="h-4 w-4" /> Aportado
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjust(line, -1)}
                        disabled={line.quantity <= 0}
                        aria-label={`Menos ${line.label}`}
                        className="border-border text-foreground flex h-10 w-10 items-center justify-center rounded-lg border disabled:opacity-30"
                      >
                        <Minus aria-hidden className="h-4 w-4" />
                      </button>
                      <span className="text-foreground min-w-[3.5rem] text-center text-sm font-semibold tabular-nums">
                        {line.unit === 'money' ? formatBRL(line.quantity) : formatQuantity(line.quantity, line.type)}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjust(line, 1)}
                        disabled={stepQuantity(line, 1, plan.leftover) === line.quantity}
                        aria-label={`Mais ${line.label}`}
                        className="border-border text-foreground flex h-10 w-10 items-center justify-center rounded-lg border disabled:opacity-30"
                      >
                        <Plus aria-hidden className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setContributing(line)}
                        disabled={line.quantity <= 0}
                        className="bg-primary/10 text-primary ml-auto min-h-[40px] rounded-lg px-4 text-sm font-semibold disabled:opacity-40"
                      >
                        Aportar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {idle.length > 0 && (
              <ul className="flex flex-col gap-1 px-1">
                {idle.map((line) => {
                  const canAdd =
                    (line.blocked === 'waiting' || line.blocked === 'atTarget') &&
                    stepQuantity(line, 1, plan.leftover) !== line.quantity;
                  return (
                    <li key={line.id} className="text-muted flex min-h-[32px] items-center gap-2 text-xs">
                      <span className="text-foreground font-medium">{line.unit === 'money' ? 'Valor total' : line.label}</span>
                      <span className="min-w-0 flex-1 truncate">{line.blocked ? BLOCK_TEXT[line.blocked] : ''}</span>
                      {canAdd && (
                        <button
                          type="button"
                          onClick={() => adjust(line, 1)}
                          aria-label={`Pôr ${line.label} neste aporte`}
                          className="border-border text-foreground flex h-8 w-8 items-center justify-center rounded-lg border"
                        >
                          <Plus aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {stopped.length > 0 && (
        <section className="mx-4 flex flex-col gap-1.5">
          <h3 className="text-muted text-sm font-semibold">Não compro mais</h3>
          <ul className="flex flex-col gap-1">
            {stopped.map((line) => (
              <li key={line.id} className="text-muted flex items-center gap-2 text-xs">
                <span className="text-foreground font-medium">{line.label}</span>
                <span className="min-w-0 flex-1 truncate">{assetType(line.type).shortLabel}</span>
                <span className="tabular-nums">hoje {plan.invested > 0 ? pct(line.value / plan.invested) : '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-3 px-4">
        <button
          type="button"
          onClick={() => setQuantities(suggested)}
          className="border-border text-foreground flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          Refazer sugestão
        </button>
        <button
          type="button"
          onClick={() => setContributing('all')}
          disabled={pending.length === 0}
          className="bg-primary text-primary-foreground min-h-[44px] flex-1 rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
        >
          Aportar tudo
        </button>
      </div>

      {contributing && (
        <ContributeSheet
          lines={contributing === 'all' ? pending : [contributing]}
          single={contributing !== 'all'}
          launchAvailable={launchAvailable}
          onClose={() => setContributing(null)}
          onDone={async (confirmedLines) => {
            setQuantities((current) => ({
              ...current,
              ...Object.fromEntries(confirmedLines.map((line) => [line.id, line.quantity])),
            }));
            setDone((current) => [...current, ...confirmedLines.map((line) => line.id)]);
            setContributing(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

/**
 * "Aportar" (one line, its quantity still editable) or "Aportar tudo": adds the quotas (or the
 * R$, for fixed income) to the portfolio, moves their dates and keeps the aporte in the history.
 */
function ContributeSheet({
  lines,
  single,
  launchAvailable,
  onClose,
  onDone,
}: {
  lines: PlanLine[];
  single: boolean;
  launchAvailable: boolean;
  onClose: () => void;
  onDone: (lines: PlanLine[]) => Promise<void>;
}) {
  const { showToast } = useToast();
  const first = lines[0];
  const [quantity, setQuantity] = useState(
    first.unit === 'money' ? amountToInputValue(first.quantity) : String(first.quantity).replace('.', ','),
  );
  const [launch, setLaunch] = useState(false);
  const [saving, setSaving] = useState(false);

  const edited: PlanLine[] = single
    ? [
        {
          ...first,
          quantity: Math.max(0, parseAmountInput(quantity)),
          amount:
            first.unit === 'money'
              ? Math.max(0, parseAmountInput(quantity))
              : Math.max(0, parseAmountInput(quantity)) * (first.price ?? 0),
        },
      ]
    : lines;
  const total = edited.reduce((sum, line) => sum + line.amount, 0);
  const valid = edited.every((line) => line.quantity > 0);

  return (
    <BottomSheet
      open
      title={single ? `Aportar em ${first.unit === 'money' ? assetType(first.type).label : first.label}` : 'Aportar tudo'}
      onClose={onClose}
      confirmDiscard={false}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          setSaving(true);
          try {
            await diagramRepository.contribute({
              date: todayISO(),
              month: currentMonthKey(),
              items: edited.map((line) => ({
                ...(line.unit === 'money' ? {} : { assetId: line.id }),
                type: line.type,
                quantity: line.quantity,
              })),
              launchExpense: launch,
            });
            showToast(
              single
                ? `Aporte registrado: ${edited[0].unit === 'money' ? formatBRL(edited[0].amount) : quotasLabel(edited[0].quantity, edited[0].type)} somado à carteira.`
                : `Aporte de ${formatBRL(total)} registrado na carteira.`,
            );
            await onDone(edited);
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Não foi possível registrar o aporte.', 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        {single ? (
          first.unit === 'money' ? (
            <AmountInput value={quantity} onChange={setQuantity} autoFocus label="Valor do aporte" />
          ) : (
            <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
              Quantas cotas você comprou
              <input
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                autoFocus
                className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
              />
              <span className="text-muted text-xs font-normal">
                A {formatBRL(first.price ?? 0)} cada: {formatBRL(edited[0].amount)}.
              </span>
            </label>
          )
        ) : (
          <ul className="border-border divide-border flex flex-col divide-y rounded-xl border">
            {edited.map((line) => (
              <li key={line.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="text-foreground min-w-0 flex-1 truncate font-medium">
                  {line.unit === 'money' ? assetType(line.type).label : line.label}
                </span>
                <span className="text-muted text-xs">
                  {line.unit === 'money' ? '' : quotasLabel(line.quantity, line.type)}
                </span>
                <span className="text-foreground font-semibold tabular-nums">{formatBRL(line.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-muted text-sm">
          As cotas são somadas à sua carteira com a data de hoje, e o aporte fica no histórico.
          {!single && ` Total: ${formatBRL(total)}.`}
        </p>

        {launchAvailable && (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={launch}
              onChange={(event) => setLaunch(event.target.checked)}
              className="accent-primary mt-0.5 h-5 w-5 shrink-0"
            />
            <span className="flex flex-col">
              <span className="text-foreground text-sm font-medium">Lançar em Investimentos</span>
              <span className="text-muted text-xs">
                Cria um gasto de {formatBRL(total)} na categoria Investimentos, com a data de hoje.
              </span>
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={saving || !valid}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Registrando…' : single ? 'Aportar' : `Aportar ${formatBRL(total)}`}
        </button>
      </form>
    </BottomSheet>
  );
}
