'use client';

import { formatMonthLabel } from '@/lib/budget';
import { useMonthContext } from '@/components/month/MonthContext';
import { MonthSwitcher } from '@/components/month/MonthSwitcher';
import { SummaryHeader } from '@/components/month/SummaryHeader';
import { CardBillCard } from '@/components/month/CardBillCard';
import { TopicCard } from '@/components/month/TopicCard';
import { FixedCostsCard } from '@/components/month/FixedCostsCard';
import { useSettings } from '@/components/providers/SettingsProvider';
import { Fab } from '@/components/ui/Fab';

export function DashboardScreen() {
  const {
    month,
    summary,
    monthData,
    loading,
    error,
    closeMonth,
    reopenMonth,
    deleteMonth,
    openExpenseForm,
    openIncomeForm,
  } = useMonthContext();
  const { settings } = useSettings();

  function handleDeleteMonth() {
    const confirmed = window.confirm(
      `Apagar todos os lançamentos de ${formatMonthLabel(month)}? ` +
        'As sobras dos meses seguintes serão recalculadas. Essa ação não pode ser desfeita.',
    );
    if (confirmed) void deleteMonth();
  }

  if (loading || !summary || !settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-56">
      <MonthSwitcher month={month} />

      {error && <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">{error}</p>}

      {monthData?.closed && (
        <div className="bg-warning-bg text-warning flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
          <span>Este mês está fechado.</span>
          <button
            type="button"
            onClick={() => void reopenMonth()}
            className="min-h-[36px] font-semibold underline"
          >
            Reabrir
          </button>
        </div>
      )}

      <SummaryHeader summary={summary} />

      <CardBillCard summary={summary} />

      <section className="flex flex-col gap-3" aria-label="Categorias" data-tour="categorias">
        {summary.topics.map((topic) => (
          <TopicCard key={topic.topicId} month={month} topic={topic} />
        ))}
      </section>

      <FixedCostsCard
        summary={summary}
        specialCategories={settings.specialCategories}
        specialCategoryColors={settings.specialCategoryColors}
      />

      {!monthData?.closed && (
        <button
          type="button"
          onClick={() => void closeMonth()}
          className="border-border text-muted hover:text-foreground min-h-[44px] self-start rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Fechar mês
        </button>
      )}

      <button
        type="button"
        onClick={handleDeleteMonth}
        className="border-danger text-danger min-h-[44px] w-full rounded-lg border px-4 text-sm font-semibold"
      >
        Apagar dados de {formatMonthLabel(month)}
      </button>

      <div className="fixed right-4 bottom-20 z-30 flex flex-col items-end gap-2">
        <Fab label="Renda" variant="secondary" onClick={() => openIncomeForm()} tourId="fab-renda" />
        <Fab label="Lançar gasto" onClick={() => openExpenseForm()} tourId="fab-lancar-gasto" />
      </div>
    </div>
  );
}
