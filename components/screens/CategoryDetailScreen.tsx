'use client';

import { ModuleGate } from '@/components/modules/ModuleGate';
import { useMonthContext } from '@/components/month/MonthContext';
import { leftoverLabel } from '@/components/month/TopicCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  computeProgressState,
  expenseDayLabel,
  expenseListDate,
  formatBRL,
  formatMonthLabel,
  formatPct,
  investmentTopicId,
} from '@/lib/budget';

export function CategoryDetailScreen({ topicId }: { topicId: string }) {
  return (
    <ModuleGate module="budget">
      <CategoryDetail topicId={topicId} />
    </ModuleGate>
  );
}

function CategoryDetail({ topicId }: { topicId: string }) {
  const { month, summary, monthData, loading, openExpenseForm } = useMonthContext();
  const { settings } = useSettings();

  if (loading || !summary || !monthData) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const topic = summary.topics.find((t) => t.topicId === topicId);
  if (!topic) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <PageHeader title="Categoria" backHref={`/mes/${month}/categorias`} />
        <p className="text-muted px-4">Categoria não encontrada neste mês.</p>
      </div>
    );
  }

  const entries = monthData.expenses
    .filter((e) => e.topicId === topicId && e.categoryKind === 'topic')
    .sort((a, b) => expenseListDate(b).localeCompare(expenseListDate(a)));

  // Investimentos: what goes to it is money set aside to invest, not money gone.
  const investing = settings ? investmentTopicId(settings.topics) === topicId : false;
  const over = topic.remaining < 0;
  // A category with no limit yet and nothing spent is an empty bar, not a full one.
  const usedPct = topic.usedPct ?? (topic.spent > 0 ? null : 0);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader
        title={topic.name}
        subtitle={formatMonthLabel(month)}
        backHref={`/mes/${month}/categorias`}
        accentColor={topic.color}
      />

      <div className="flex flex-col gap-3 px-4">
        {topic.description && <p className="text-muted text-sm">{topic.description}</p>}

        <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
          <p className="text-muted text-xs">{leftoverLabel(investing, over)}</p>
          <p
            className={`text-2xl leading-tight font-bold tabular-nums ${over ? 'text-danger' : 'text-foreground'}`}
          >
            {formatBRL(investing && over ? -topic.remaining : topic.remaining)}
          </p>
          <div className="mt-2.5">
            <ProgressBar
              usedPct={usedPct}
              state={computeProgressState(usedPct)}
              color={over ? undefined : topic.color}
            />
          </div>
          <div className="text-muted mt-2 flex items-baseline justify-between gap-2 text-xs">
            <span>
              {investing ? 'Separou para investir' : 'Gastou'} {formatBRL(topic.spent)}
            </span>
            <span>Limite {formatBRL(topic.available)}</span>
          </div>
        </div>

        {!monthData.closed && (
          <button
            type="button"
            onClick={() => openExpenseForm(undefined, 'topic', topicId)}
            className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold"
          >
            {investing ? '+ Registrar investimento' : `+ Lançar gasto em ${topic.name}`}
          </button>
        )}

        <div className="border-border bg-card rounded-xl border p-4 text-sm shadow-sm">
          <p className="text-muted mb-2 text-xs font-medium">De onde vem o limite</p>
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{formatPct(topic.targetPct, 0)} da renda</dt>
              <dd className="text-foreground tabular-nums">{formatBRL(topic.incomeShare)}</dd>
            </div>
            {topic.directIncome > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">+ Renda só desta categoria</dt>
                <dd className="text-foreground tabular-nums">{formatBRL(topic.directIncome)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-muted">− Parte dos custos fixos e imprevistos</dt>
              <dd className="text-foreground tabular-nums">{formatBRL(topic.proportionalFixed)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">+ Sobra do mês passado</dt>
              <dd className={`tabular-nums ${topic.carryIn < 0 ? 'text-danger' : 'text-foreground'}`}>
                {formatBRL(topic.carryIn)}
              </dd>
            </div>
            <div className="border-border flex justify-between gap-2 border-t pt-1.5 font-semibold">
              <dt className="text-foreground">= Limite</dt>
              <dd className="text-foreground tabular-nums">{formatBRL(topic.available)}</dd>
            </div>
          </dl>
        </div>

        <ul className="flex flex-col gap-2">
          {entries.length === 0 && (
            <p className="text-muted py-6 text-center text-sm">Nada lançado aqui neste mês.</p>
          )}
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => openExpenseForm(entry)}
                className="border-border bg-card flex min-h-[56px] w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left shadow-sm"
              >
                <span className="min-w-0">
                  <span className="text-foreground block truncate font-medium">{entry.description}</span>
                  <span className="text-muted block text-xs">{expenseDayLabel(entry)}</span>
                </span>
                <span className="text-foreground font-semibold">{formatBRL(entry.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
