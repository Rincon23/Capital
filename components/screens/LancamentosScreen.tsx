'use client';

import { useEffect, useMemo, useState } from 'react';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton, ModuleSettingsButton } from '@/components/modules/ModuleHelpButton';
import { ModuleSettingsSheet } from '@/components/modules/ModuleSettingsSheet';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { CategoriesSettings } from '@/components/settings/CategoriesSettings';
import { useBackHref } from '@/components/modules/useBackHref';
import { ClosedMonthBanner } from '@/components/month/ClosedMonthBanner';
import { MONTH_ACTIONS_PADDING, MonthActions } from '@/components/month/MonthActions';
import { useMonthContext } from '@/components/month/MonthContext';
import { MonthSwitcher } from '@/components/month/MonthSwitcher';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import {
  formatBRL,
  formatMonthLabel,
  REIMBURSABLE_EXPLANATION,
  UNCOUNTED_ADVICE,
  UNCOUNTED_EXPLANATION,
  resolveSpecialCategoryLabels,
  specialCategoryLabel,
  type CategoryKind,
  type Expense,
  type Income,
} from '@/lib/budget';
import { isModuleOn } from '@/lib/modules';

/**
 * The tabs of the screen. "fixed" is one tab holding both fixed costs and unforeseen expenses:
 * they are the two categories with no target of their own, both rateadas entre as categorias,
 * and looking for one of them meant guessing which of two tabs it was in.
 */
export type LancamentosTab = 'topic' | 'income' | 'fixed' | 'reimbursable' | 'uncounted';
type TabKey = LancamentosTab;

function topicName(topics: { id: string; name: string }[], topicId?: string): string {
  return topics.find((t) => t.id === topicId)?.name ?? '—';
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function LancamentosScreen({ initialTab }: { initialTab?: LancamentosTab }) {
  return (
    <ModuleGate module="expenses">
      <Lancamentos initialTab={initialTab} />
    </ModuleGate>
  );
}

function Lancamentos({ initialTab }: { initialTab?: LancamentosTab }) {
  const backHref = useBackHref('expenses');
  const { month, monthData, loading, error, openExpenseForm, openIncomeForm, deleteMonth, saveExpense } =
    useMonthContext();
  const { settings } = useSettings();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'topic');
  const [search, setSearch] = useState('');
  const [configuring, setConfiguring] = useState(false);
  useModuleIntro('expenses', { ready: !loading && !!monthData && !!settings });

  // A link to "?aba=…" while the screen is already open (the "A receber" tour) switches the tab.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const labels = resolveSpecialCategoryLabels(settings?.specialCategories);
  // The "A receber" tab shows while the module is on, and also when the month still has such
  // expenses from before it was turned off — so they never become unreachable.
  const showReimbursable =
    isModuleOn(settings, 'reimbursable') ||
    (monthData?.expenses.some((e) => e.categoryKind === 'reimbursable') ?? false);
  // "Fora do orçamento" is never advertised: the tab only shows up once the month has one.
  const showUncounted = monthData?.expenses.some((e) => e.categoryKind === 'uncounted') ?? false;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'topic', label: 'Gastos' },
    { key: 'income', label: 'Renda' },
    { key: 'fixed', label: `${labels.fixedCost} e ${labels.unforeseen}` },
    ...(showReimbursable ? [{ key: 'reimbursable' as const, label: labels.reimbursable }] : []),
    ...(showUncounted ? [{ key: 'uncounted' as const, label: labels.uncounted }] : []),
  ];

  const filteredExpenses = useMemo(() => {
    if (!monthData) return [];
    const kinds: CategoryKind[] =
      tab === 'income' ? [] : tab === 'fixed' ? ['fixedCost', 'unforeseen'] : [tab];
    return monthData.expenses
      .filter((e) => kinds.includes(e.categoryKind))
      .filter((e) => e.description.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [monthData, tab, search]);

  const filteredIncomes = useMemo(() => {
    if (!monthData) return [];
    return monthData.incomes
      .filter((i) => i.source.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [monthData, search]);

  if (loading || !monthData || !settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  async function handleDeleteMonth() {
    const confirmed = await confirm({
      title: `Apagar ${formatMonthLabel(month)}`,
      message: `Isso apaga todos os lançamentos de ${formatMonthLabel(month)}. As sobras dos meses seguintes serão recalculadas. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Apagar',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) {
      showToast('Operação cancelada. Nenhuma alteração foi realizada.', 'info');
      return;
    }
    try {
      await deleteMonth();
      showToast('Lançamentos apagados.');
    } catch {
      showToast('Não foi possível concluir esta operação. Tente novamente em alguns instantes.', 'error');
    }
  }

  function handleEditExpense(expense: Expense) {
    openExpenseForm(expense);
  }

  /**
   * "Já me pagou". It changes no number in the budget — an "A receber" purchase never consumed a
   * category — it only takes the entry out of what other people still owe.
   */
  async function toggleReimbursed(expense: Expense) {
    const settled = Boolean(expense.reimbursedAt);
    try {
      await saveExpense({
        ...expense,
        ...(settled ? { reimbursedAt: undefined } : { reimbursedAt: new Date().toISOString() }),
      });
      showToast(settled ? 'Marcado como ainda a receber.' : 'Marcado como recebido.');
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    }
  }

  function handleEditIncome(income: Income) {
    openIncomeForm(income);
  }

  return (
    <div className={`flex flex-1 flex-col gap-3 ${MONTH_ACTIONS_PADDING}`}>
      <PageHeader
        title="Lançamentos"
        subtitle={formatMonthLabel(month)}
        backHref={backHref}
        action={
          <>
            <ModuleHelpButton module="expenses" />
            <ModuleSettingsButton
              module="expenses"
              tourAnchor="lancamentos-config"
              onClick={() => setConfiguring(true)}
            />
          </>
        }
      />

      <div className="flex flex-col gap-3 px-4">
        <div data-tour="lancamentos-mes">
          <MonthSwitcher month={month} path="/lancamentos" />
        </div>
        {error && <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">{error}</p>}
        <ClosedMonthBanner />
      </div>

      <div className="flex gap-2 overflow-x-auto px-4" data-tour="lancamentos-abas" data-no-swipe-nav>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            data-tour={t.key === 'reimbursable' ? 'aba-a-receber' : undefined}
            onClick={() => setTab(t.key)}
            className={`min-h-[40px] shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'reimbursable' && (
        <div className="bg-card border-border mx-4 flex flex-col gap-1 rounded-xl border px-4 py-3">
          <p className="text-muted text-sm">{REIMBURSABLE_EXPLANATION}</p>
          <div>
            <ModuleHelpButton module="reimbursable" variant="link" label="Como funciona A receber?" />
          </div>
        </div>
      )}

      {tab === 'uncounted' && (
        <div className="bg-warning-bg mx-4 flex flex-col gap-1 rounded-xl px-4 py-3">
          <p className="text-warning text-sm font-semibold">{UNCOUNTED_ADVICE}</p>
          <p className="text-muted text-sm">{UNCOUNTED_EXPLANATION}</p>
        </div>
      )}

      <div className="px-4" data-tour="lancamentos-busca">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descrição ou fonte..."
          className="border-border bg-card text-foreground focus:ring-primary min-h-[44px] w-full rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
        />
      </div>

      {tab === 'reimbursable' && filteredExpenses.length > 0 ? (
        <ReimbursableList
          expenses={filteredExpenses}
          onEdit={handleEditExpense}
          onToggle={toggleReimbursed}
        />
      ) : (
        <ul className="flex flex-col gap-2 px-4">
          {tab === 'income'
            ? filteredIncomes.map((income) => (
                <li key={income.id}>
                  <button
                    type="button"
                    onClick={() => handleEditIncome(income)}
                    className="border-border bg-card flex min-h-[56px] w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left shadow-sm"
                  >
                    <span className="min-w-0">
                      <span className="text-foreground block truncate font-medium">{income.source}</span>
                      {income.date && (
                        <span className="text-muted block text-xs">{formatDate(income.date)}</span>
                      )}
                    </span>
                    <span className="text-success font-semibold">{formatBRL(income.amount)}</span>
                  </button>
                </li>
              ))
            : filteredExpenses.map((expense) => (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => handleEditExpense(expense)}
                    className="border-border bg-card flex min-h-[56px] w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left shadow-sm"
                  >
                    <span className="min-w-0">
                      <span className="text-foreground block truncate font-medium">
                        {expense.description}
                      </span>
                      <span className="text-muted block text-xs">
                        {formatDate(expense.date)}
                        {expense.categoryKind === 'topic'
                          ? ` · ${topicName(settings.topics, expense.topicId)}`
                          : tab === 'fixed'
                            ? ` · ${specialCategoryLabel(expense.categoryKind, labels)}`
                            : ''}
                      </span>
                    </span>
                    <span className="text-foreground font-semibold">{formatBRL(expense.amount)}</span>
                  </button>
                </li>
              ))}

          {(tab === 'income' ? filteredIncomes.length : filteredExpenses.length) === 0 && (
            <p className="text-muted py-10 text-center text-sm">Nenhum lançamento encontrado.</p>
          )}
        </ul>
      )}

      {(monthData.expenses.length > 0 || monthData.incomes.length > 0) && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => void handleDeleteMonth()}
            className="border-danger text-danger min-h-[44px] w-full rounded-lg border px-4 text-sm font-semibold"
          >
            Apagar dados de {formatMonthLabel(month)}
          </button>
        </div>
      )}

      <MonthActions
        defaultCategoryKind={tab === 'income' ? undefined : tab === 'fixed' ? 'fixedCost' : tab}
      />

      {configuring && (
        <ModuleSettingsSheet module="expenses" onClose={() => setConfiguring(false)}>
          <CategoriesSettings withTargets={false} onSaved={() => setConfiguring(false)} />
        </ModuleSettingsSheet>
      )}
    </div>
  );
}

/**
 * "A receber", split by who already paid. The tick is the whole point of the tab: the money is
 * on the card bill either way, so the only thing the person is tracking here is who still owes
 * them — and that has to be one tap, not a trip through the expense form.
 */
function ReimbursableList({
  expenses,
  onEdit,
  onToggle,
}: {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onToggle: (expense: Expense) => void;
}) {
  const pending = expenses.filter((expense) => !expense.reimbursedAt);
  const settled = expenses.filter((expense) => expense.reimbursedAt);
  const total = (list: Expense[]) => list.reduce((sum, expense) => sum + expense.amount, 0);

  function group(title: string, list: Expense[], done: boolean) {
    if (list.length === 0) return null;
    return (
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-muted text-sm font-semibold">{title}</h2>
          <span className={`text-sm font-semibold ${done ? 'text-success' : 'text-foreground'}`}>
            {formatBRL(total(list))}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {list.map((expense) => (
            <li
              key={expense.id}
              className="border-border bg-card flex items-center gap-2 rounded-xl border pr-4 shadow-sm"
            >
              <button
                type="button"
                onClick={() => onToggle(expense)}
                aria-pressed={done}
                aria-label={done ? `Desmarcar ${expense.description}` : `${expense.description}: já me pagou`}
                className="flex h-14 w-14 shrink-0 items-center justify-center"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                    done
                      ? 'border-success bg-success text-primary-foreground'
                      : 'border-border text-transparent'
                  }`}
                >
                  ✓
                </span>
              </button>
              <button type="button" onClick={() => onEdit(expense)} className="min-w-0 flex-1 py-3 text-left">
                <span className={`block truncate font-medium ${done ? 'text-muted' : 'text-foreground'}`}>
                  {expense.description}
                </span>
                <span className="text-muted block text-xs">
                  {formatDate(expense.date)}
                  {expense.reimbursedAt && ` · recebido em ${formatDate(expense.reimbursedAt.slice(0, 10))}`}
                </span>
              </button>
              <span className={`shrink-0 font-semibold ${done ? 'text-muted' : 'text-foreground'}`}>
                {formatBRL(expense.amount)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4">
      {group('Ainda devem', pending, false)}
      {group('Já me pagaram', settled, true)}
    </div>
  );
}
