'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Percent } from 'lucide-react';
import { formatMonthLabel, nextMonth } from '@/lib/budget';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton, ModuleSettingsButton } from '@/components/modules/ModuleHelpButton';
import { ModuleSettingsSheet } from '@/components/modules/ModuleSettingsSheet';
import { useBackHref } from '@/components/modules/useBackHref';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { ClosedMonthBanner } from '@/components/month/ClosedMonthBanner';
import { CloseMonthSheet } from '@/components/month/CloseMonthSheet';
import { FixedCostsCard } from '@/components/month/FixedCostsCard';
import { useMonthContext } from '@/components/month/MonthContext';
import { MonthSwitcher } from '@/components/month/MonthSwitcher';
import { SummaryHeader } from '@/components/month/SummaryHeader';
import { TopicCard } from '@/components/month/TopicCard';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useSettings } from '@/components/providers/SettingsProvider';
import { CategoriesSettings } from '@/components/settings/CategoriesSettings';
import { useToast } from '@/components/ui/Toast';

/** "Gastos por categoria": the month's targets, what is left in each category and closing the month. */
export function CategoriasScreen() {
  return (
    <ModuleGate module="budget">
      <Categorias />
    </ModuleGate>
  );
}

function Categorias() {
  const backHref = useBackHref('budget');
  const { month, summary, monthData, loading, error, closeMonth, refresh } = useMonthContext();
  const { settings, saveSettings } = useSettings();
  const { showToast } = useToast();
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  /** "Me ajude com as %": the same questions as the first visit, without the tour after. */
  const [helping, setHelping] = useState(false);
  // First visit: the questions (income, fixed costs, unforeseen, what each category is for and the
  // percentages), then the tour.
  const { setupOpen, finishSetup } = useModuleIntro('budget', {
    ready: !loading && !!summary && !!settings,
    withSetup: true,
  });

  /** Closes the month and opens the next one carrying the leftovers, then goes to it. */
  async function handleCloseMonth() {
    try {
      await closeMonth(true);
      setClosing(false);
      showToast('Mês fechado com sucesso! Seus dados foram atualizados.');
      router.push(`/mes/${nextMonth(month)}/categorias`);
    } catch {
      showToast('Não foi possível fechar o mês. Tente novamente em alguns instantes.', 'error');
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader
        title="Categorias"
        subtitle={formatMonthLabel(month)}
        backHref={backHref}
        action={
          <>
            <ModuleHelpButton module="budget" />
            <ModuleSettingsButton
              module="budget"
              tourAnchor="categorias-config"
              onClick={() => setConfiguring(true)}
            />
          </>
        }
      />

      <div className="flex flex-col gap-4 px-4">
        <MonthSwitcher month={month} path="/categorias" />

        {error && <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">{error}</p>}

        {loading || !summary || !settings ? (
          <p className="text-muted py-16 text-center">Carregando…</p>
        ) : (
          <>
            {monthData?.closed && (
              <div data-tour="fechar-mes">
                <ClosedMonthBanner />
              </div>
            )}

            <SummaryHeader summary={summary} />

            <section className="flex flex-col gap-3" aria-labelledby="categorias-titulo">
              <div className="flex items-center justify-between gap-2">
                <h2 id="categorias-titulo" className="text-muted text-sm font-semibold">
                  Suas categorias
                </h2>
                <button
                  type="button"
                  onClick={() => setHelping(true)}
                  data-tour="categorias-porcentagens"
                  className="border-border text-primary hover:bg-card inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm font-semibold"
                >
                  <Percent aria-hidden className="h-4 w-4" />
                  Me ajude com as %
                </button>
              </div>
              <div className="flex flex-col gap-3" data-tour="categorias">
                {summary.topics.map((topic) => (
                  <TopicCard key={topic.topicId} month={month} topic={topic} />
                ))}
              </div>
            </section>

            <div data-tour="custos-fixos">
              <FixedCostsCard
                summary={summary}
                specialCategories={settings.specialCategories}
                specialCategoryColors={settings.specialCategoryColors}
              />
            </div>

            {!monthData?.closed && (
              <button
                type="button"
                onClick={() => setClosing(true)}
                data-tour="fechar-mes"
                className="border-border text-muted hover:text-foreground min-h-[44px] self-start rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Fechar mês
              </button>
            )}
          </>
        )}
      </div>

      {closing && summary && (
        <CloseMonthSheet
          summary={summary}
          onConfirm={handleCloseMonth}
          onCancel={() => {
            setClosing(false);
            showToast('Fechamento cancelado. Nenhuma alteração foi feita.', 'info');
          }}
        />
      )}

      {configuring && (
        <ModuleSettingsSheet module="budget" onClose={() => setConfiguring(false)}>
          <CategoriesSettings withTargets onSaved={() => setConfiguring(false)} />
        </ModuleSettingsSheet>
      )}

      {setupOpen && settings && (
        <OnboardingWizard
          settings={settings}
          saveSettings={saveSettings}
          intro={{
            title: 'Vamos montar suas categorias',
            text: 'Algumas perguntas rápidas: quanto você ganha, seus custos fixos e imprevistos, para que serve cada categoria e quanto da renda vai para cada uma. Depois eu te mostro como a tela funciona.',
            start: 'Vamos lá',
          }}
          onSkip={finishSetup}
          onComplete={() => {
            void refresh();
            finishSetup();
          }}
        />
      )}

      {helping && settings && (
        <OnboardingWizard
          settings={settings}
          saveSettings={saveSettings}
          intro={{
            title: 'Quanto vai para cada categoria?',
            text: 'Conte quanto você ganha e seus custos fixos e imprevistos. Eu explico para que serve cada categoria e mostro, na hora, quanto cada % deixa para gastar.',
            start: 'Vamos lá',
          }}
          onSkip={() => setHelping(false)}
          onComplete={() => {
            setHelping(false);
            void refresh();
            showToast('Categorias salvas.');
          }}
        />
      )}
    </div>
  );
}
