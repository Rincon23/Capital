'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AdherenceMeter } from '@/components/history/AdherenceMeter';
import {
  CompositionBarChart,
  RemainingLineChart,
  SpendingLineChart,
  type TopicSeries,
} from '@/components/history/HistoryCharts';
import { useAllMonths } from '@/lib/hooks/useAllMonths';
import { useSettings } from '@/components/providers/SettingsProvider';
import { formatBRL, formatMonthLabel, formatPct } from '@/lib/budget';

export function HistoricoScreen() {
  const { settings } = useSettings();
  const { summaries, loading, error } = useAllMonths(settings?.topics);

  const topics: TopicSeries[] = useMemo(() => {
    const byId = new Map<string, TopicSeries>();
    for (const summary of summaries) {
      for (const topic of summary.topics) {
        byId.set(topic.topicId, { id: topic.topicId, name: topic.name, color: topic.color });
      }
    }
    return Array.from(byId.values());
  }, [summaries]);

  const latest = summaries.at(-1);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const tableIndex = useMemo(() => {
    if (summaries.length === 0) return -1;
    const found = selectedMonth
      ? summaries.findIndex((summary) => summary.month === selectedMonth)
      : -1;
    return found === -1 ? summaries.length - 1 : found;
  }, [summaries, selectedMonth]);
  const tableSummary = tableIndex === -1 ? undefined : summaries[tableIndex];

  if (loading) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <PageHeader title="Histórico" />
        <p className="text-danger px-4 text-sm">{error}</p>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <PageHeader title="Histórico" />
        <p className="text-muted px-4">Nenhum mês registrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 pb-10">
      <PageHeader title="Histórico & Gráficos" />

      <section className="flex flex-col gap-2 px-4">
        <h2 className="text-muted text-sm font-semibold">
          Aderência à meta ({latest ? formatMonthLabel(latest.month) : ''})
        </h2>
        <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
          {latest?.topics.map((topic) => (
            <AdherenceMeter
              key={topic.topicId}
              label={topic.name}
              targetPct={topic.targetPct}
              actualPct={latest.incomeTotal > 0 ? topic.spent / latest.incomeTotal : 0}
              color={topic.color}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 px-4">
        <h2 className="text-muted text-sm font-semibold">Evolução do gasto por categoria</h2>
        <div className="border-border bg-card rounded-xl border p-3 shadow-sm">
          <SpendingLineChart summaries={summaries} topics={topics} />
        </div>
      </section>

      <section className="flex flex-col gap-2 px-4">
        <h2 className="text-muted text-sm font-semibold">Composição do gasto por mês</h2>
        <div className="border-border bg-card rounded-xl border p-3 shadow-sm">
          <CompositionBarChart summaries={summaries} topics={topics} />
        </div>
      </section>

      <section className="flex flex-col gap-2 px-4">
        <h2 className="text-muted text-sm font-semibold">Sobra acumulada (rollover) por categoria</h2>
        <div className="border-border bg-card rounded-xl border p-3 shadow-sm">
          <RemainingLineChart summaries={summaries} topics={topics} />
        </div>
      </section>

      <section className="flex flex-col gap-2 px-4">
        <h2 className="text-muted text-sm font-semibold">Tabela mês a mês</h2>
        <div className="border-border bg-card flex flex-col rounded-xl border shadow-sm">
          <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
            <button
              type="button"
              onClick={() => setSelectedMonth(summaries[tableIndex - 1]?.month ?? null)}
              disabled={tableIndex <= 0}
              aria-label="Mês anterior"
              className="text-foreground hover:bg-background flex h-9 w-9 items-center justify-center rounded-full text-xl disabled:cursor-not-allowed disabled:opacity-30"
            >
              ‹
            </button>
            <span className="text-foreground text-sm font-semibold">
              {tableSummary ? formatMonthLabel(tableSummary.month) : ''}
            </span>
            <button
              type="button"
              onClick={() => setSelectedMonth(summaries[tableIndex + 1]?.month ?? null)}
              disabled={tableIndex === -1 || tableIndex >= summaries.length - 1}
              aria-label="Próximo mês"
              className="text-foreground hover:bg-background flex h-9 w-9 items-center justify-center rounded-full text-xl disabled:cursor-not-allowed disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-border text-muted border-b text-left">
                  <th className="px-3 py-2 font-medium">Categoria</th>
                  <th className="px-3 py-2 text-right font-medium">Gasto</th>
                  <th className="px-3 py-2 text-right font-medium">Posso gastar</th>
                  <th className="px-3 py-2 text-right font-medium">Sobra</th>
                  <th className="px-3 py-2 text-right font-medium">% Utilizada</th>
                </tr>
              </thead>
              <tbody>
                {tableSummary?.topics.map((topic) => (
                  <tr
                    key={`${tableSummary.month}-${topic.topicId}`}
                    className="border-border border-b last:border-0"
                  >
                    <td className="text-foreground px-3 py-2">{topic.name}</td>
                    <td className="text-foreground px-3 py-2 text-right font-[tabular-nums]">
                      {formatBRL(topic.spent)}
                    </td>
                    <td className="text-foreground px-3 py-2 text-right font-[tabular-nums]">
                      {formatBRL(topic.available)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-[tabular-nums] ${topic.remaining < 0 ? 'text-danger' : 'text-foreground'}`}
                    >
                      {formatBRL(topic.remaining)}
                    </td>
                    <td className="text-foreground px-3 py-2 text-right font-[tabular-nums]">
                      {topic.usedPct === null ? '—' : formatPct(topic.usedPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
