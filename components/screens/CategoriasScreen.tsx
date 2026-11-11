'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Percent } from 'lucide-react';
import {
  currentMonthKey,
  formatBRL,
  formatMonthLabel,
  formatMonthName,
  investmentTopicId,
  nextMonth,
} from '@/lib/budget';
import { useMonthsToClose } from '@/lib/hooks/useMonthsToClose';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton, ModuleSettingsButton } from '@/components/modules/ModuleHelpButton';
import { ModuleSettingsSheet } from '@/components/modules/ModuleSettingsSheet';
import { useHomeHref } from '@/components/modules/useHomeHref';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { ClosedMonthBanner } from '@/components/month/ClosedMonthBanner';
import { CloseMonthSheet, closedMonthMessage } from '@/components/month/CloseMonthSheet';
import { ClosePastMonths } from '@/components/month/ClosePastMonths';
import { FixedCostsCard } from '@/components/month/FixedCostsCard';
import { MONTH_ACTIONS_PADDING, MonthActions } from '@/components/month/MonthActions';
import { useMonthContext } from '@/components/month/MonthContext';
import { MonthSwipe } from '@/components/month/MonthSwipe';
import { MonthSwitcher } from '@/components/month/MonthSwitcher';
import { SummaryHeader } from '@/components/month/SummaryHeader';
import { TopicCard } from '@/components/month/TopicCard';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useSettings } from '@/components/providers/SettingsProvider';
import { CategoriesSettings } from '@/components/settings/CategoriesSettings';
import { useToast } from '@/components/ui/Toast';

/** "Categorias": the month's limits, what is left in each category and closing the month. */
export function CategoriasScreen() {
  return (
    <ModuleGate module="budget">
      <Categorias />
    </ModuleGate>
  );
}

function Categorias() {
  const backHref = useHomeHref();
  const { month, summary, monthData, loading, error, closeMonth, refresh, openExpenseForm, openIncomeForm } =
    useMonthContext();
  const { settings, saveSettings } = useSettings();
  const toClose = useMonthsToClose(month, settings?.topics);
  const { showToast } = useToast();
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  /** "Ajustar as %": the questions of the first visit again, opening on the percentages. */
  const [helping, setHelping] = useState(false);
  // First visit: the questions (income, fixed and unforeseen costs, and the percentages).
  const { setupOpen, finishSetup } = useModuleIntro('budget', {
    ready: !loading && !!summary && !!settings,
    withSetup: true,
  });

  // The mission "Ajustar suas categorias" comes with ?ajustar=1: the questions open right away
  // (on a first visit they are already opening by themselves).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ajustar') !== '1') return;
    params.delete('ajustar');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHelping(true);
  }, []);

  /** Closes the month with the answer about the leftovers and opens the next one, then goes to it. */
  async function handleCloseMonth(bringLeftovers: boolean) {
    try {
      await closeMonth(true, !bringLeftovers);
      setClosing(false);
      if (summary) showToast(closedMonthMessage(summary, nextMonth(month), bringLeftovers));
      router.push(`/mes/${nextMonth(month)}/categorias`);
    } catch {
      showToast('Não foi possível fechar o mês. Tente de novo.', 'error');
    }
  }

  const open = !monthData?.closed;
  // A month is only closed once it is over: today's month (and any later one) has no button for it.
  const ended = month < currentMonthKey();
  const investing = settings ? investmentTopicId(settings.topics) : undefined;
  const shared = summary ? summary.fixedTotal + summary.unforeseenTotal : 0;
  const thisMonth = formatMonthName(month).toLowerCase();
  const followingMonth = formatMonthName(nextMonth(month)).toLowerCase();

  return (
    <div className={`flex flex-1 flex-col gap-4 ${open ? MONTH_ACTIONS_PADDING : 'pb-10'}`}>
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

      <MonthSwipe
        month={month}
        onMonth={(next) => router.replace(`/mes/${next}/categorias`)}
        className="flex flex-col gap-4 px-4"
      >
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

            {toClose && (
              <div data-tour="fechar-mes">
                <ClosePastMonths {...toClose} />
              </div>
            )}

            <SummaryHeader summary={summary} />

            {/* Nothing came in yet: every limit is zero, and this is the step that changes it. */}
            {open && summary.incomeTotal === 0 && (
              <div className="border-primary/40 bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
                <p className="text-foreground text-sm font-medium">
                  Registre sua renda para ver o limite de cada categoria.
                </p>
                <button
                  type="button"
                  onClick={() => openIncomeForm()}
                  className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold"
                >
                  Registrar renda
                </button>
              </div>
            )}

            <section className="flex flex-col gap-3" aria-labelledby="categorias-titulo">
              <div className="flex items-center justify-between gap-2">
                <h2 id="categorias-titulo" className="text-muted text-sm font-semibold">
                  Suas categorias
                </h2>
                <button
                  type="button"
                  onClick={() => setHelping(true)}
                  data-tour="categorias-porcentagens"
                  className="border-border text-muted hover:text-foreground inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium"
                >
                  <Percent aria-hidden className="h-3.5 w-3.5" />
                  Ajustar as %
                </button>
              </div>
              {/* Why a limit is not just the % of the income — or why it will still go down. The
                  questions of the first visit previewed the limits with the costs already in. */}
              {shared > 0 ? (
                <p className="text-muted -mt-1 text-xs">
                  Já descontam {formatBRL(shared)} de custos fixos e imprevistos.
                </p>
              ) : (
                open &&
                summary.incomeTotal > 0 && (
                  <p className="text-muted -mt-1 text-xs">
                    Os limites caem quando você lançar custos fixos e imprevistos.
                  </p>
                )
              )}
              <div className="flex flex-col gap-3" data-tour="categorias">
                {summary.topics.map((topic) => (
                  <TopicCard
                    key={topic.topicId}
                    month={month}
                    topic={topic}
                    investing={topic.topicId === investing}
                  />
                ))}
              </div>
            </section>

            <div data-tour="custos-fixos">
              <FixedCostsCard
                summary={summary}
                specialCategories={settings.specialCategories}
                specialCategoryColors={settings.specialCategoryColors}
                onAdd={open ? () => openExpenseForm(undefined, 'fixedCost') : undefined}
              />
            </div>

            {/* One at a time: with past months open, the buttons at the top close those first. A
                month that is not over cannot be closed: it only says when it will be. */}
            {open && !toClose && (
              <div
                data-tour="fechar-mes"
                className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
              >
                {ended ? (
                  <>
                    <p className="text-muted text-xs">
                      Ao fechar, você escolhe se a sobra vai para {followingMonth}.
                    </p>
                    <button
                      type="button"
                      onClick={() => setClosing(true)}
                      className="border-border text-foreground hover:bg-background min-h-[44px] rounded-lg border px-4 py-2 text-sm font-medium"
                    >
                      Fechar {thisMonth}
                    </button>
                  </>
                ) : (
                  <p className="text-muted text-xs">
                    Você fecha {thisMonth} quando o mês acabar. Aí escolhe se a sobra vai para{' '}
                    {followingMonth}.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </MonthSwipe>

      {closing && summary && ended && (
        <CloseMonthSheet
          summary={summary}
          target={nextMonth(month)}
          onConfirm={handleCloseMonth}
          onCancel={() => {
            setClosing(false);
            showToast('Nada foi fechado.', 'info');
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
          // Skipping the first visit's questions leaves for the Início, not for a Categorias still unset.
          onSkip={() => {
            setHelping(false);
            finishSetup();
            router.push(backHref);
          }}
          onComplete={() => {
            void refresh();
            setHelping(false);
            finishSetup();
          }}
        />
      )}

      {open && !loading && summary && settings && <MonthActions />}

      {helping && !setupOpen && settings && (
        <OnboardingWizard
          settings={settings}
          saveSettings={saveSettings}
          startAtPercentages
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
