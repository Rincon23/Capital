'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { AdherenceMeter } from '@/components/history/AdherenceMeter';
import {
  CompositionBarChart,
  RemainingLineChart,
  SpendingLineChart,
  type TopicSeries,
} from '@/components/history/HistoryCharts';
import { useAllMonths } from '@/lib/hooks/useAllMonths';
import { formatBRL, formatMonthLabel, formatPct } from '@/lib/budget';
import { seriesColor } from '@/lib/chartPalette';

export function HistoricoScreen() {
  const { summaries, loading, error } = useAllMonths();

  const topics: TopicSeries[] = useMemo(() => {
    const byId = new Map<string, string>();
    for (const summary of summaries) {
      for (const topic of summary.topics) byId.set(topic.topicId, topic.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [summaries]);

  const latest = summaries.at(-1);

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
          {latest?.topics.map((topic, index) => (
            <AdherenceMeter
              key={topic.topicId}
              label={topic.name}
              targetPct={topic.targetPct}
              actualPct={latest.incomeTotal > 0 ? topic.spent / latest.incomeTotal : 0}
              color={seriesColor(index)}
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
        <div className="border-border bg-card overflow-x-auto rounded-xl border shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="px-3 py-2 font-medium">Mês</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 text-right font-medium">Gasto</th>
                <th className="px-3 py-2 text-right font-medium">Posso gastar</th>
                <th className="px-3 py-2 text-right font-medium">Sobra</th>
                <th className="px-3 py-2 text-right font-medium">% Utilizada</th>
              </tr>
            </thead>
            <tbody>
              {summaries
                .slice()
                .reverse()
                .flatMap((summary) =>
                  summary.topics.map((topic) => (
                    <tr
                      key={`${summary.month}-${topic.topicId}`}
                      className="border-border border-b last:border-0"
                    >
                      <td className="text-foreground px-3 py-2 whitespace-nowrap">
                        {formatMonthLabel(summary.month)}
                      </td>
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
                  )),
                )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
