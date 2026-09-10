'use client';

import { useMemo, useState } from 'react';
import { useMonthContext } from '@/components/month/MonthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';
import { formatBRL, formatMonthLabel, type CategoryKind, type Expense, type Income } from '@/lib/budget';

type TabKey = 'topic' | 'income' | 'fixedCost' | 'unforeseen' | 'reimbursed';

function topicName(topics: { id: string; name: string }[], topicId?: string): string {
  return topics.find((t) => t.id === topicId)?.name ?? '—';
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function LancamentosScreen() {
  const { month, monthData, loading, openExpenseForm, openIncomeForm } = useMonthContext();
  const { settings } = useSettings();
  const [tab, setTab] = useState<TabKey>('topic');
  const [search, setSearch] = useState('');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'topic', label: 'Gastos' },
    { key: 'income', label: 'Renda' },
    { key: 'fixedCost', label: settings?.specialCategories.fixedCost ?? 'Custo Fixo' },
    { key: 'unforeseen', label: settings?.specialCategories.unforeseen ?? 'Imprevistos' },
    { key: 'reimbursed', label: settings?.specialCategories.reimbursed ?? 'Ressarcido' },
  ];

  const filteredExpenses = useMemo(() => {
    if (!monthData) return [];
    const kind: CategoryKind | null = tab === 'income' ? null : (tab as CategoryKind);
    return monthData.expenses
      .filter((e) => e.categoryKind === kind)
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

  function handleAdd() {
    if (tab === 'income') openIncomeForm();
    else openExpenseForm(undefined, tab);
  }

  function handleEditExpense(expense: Expense) {
    openExpenseForm(expense);
  }

  function handleEditIncome(income: Income) {
    openIncomeForm(income);
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader
        title="Lançamentos"
        subtitle={formatMonthLabel(month)}
        backHref={`/mes/${month}`}
        action={
          <button
            type="button"
            onClick={handleAdd}
            aria-label="Adicionar lançamento"
            className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            +
          </button>
        }
      />

      <div className="flex gap-2 overflow-x-auto px-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`min-h-[40px] shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descrição ou fonte..."
          className="border-border bg-card text-foreground focus:ring-primary min-h-[44px] w-full rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
        />
      </div>

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
                    <span className="text-foreground block truncate font-medium">{expense.description}</span>
                    <span className="text-muted block text-xs">
                      {formatDate(expense.date)}
                      {expense.categoryKind === 'topic' || expense.categoryKind === 'reimbursed'
                        ? ` · ${topicName(settings.topics, expense.topicId)}`
                        : ''}
                    </span>
                  </span>
                  <span
                    className={`font-semibold ${expense.categoryKind === 'reimbursed' ? 'text-success' : 'text-foreground'}`}
                  >
                    {formatBRL(expense.amount)}
                  </span>
                </button>
              </li>
            ))}

        {(tab === 'income' ? filteredIncomes.length : filteredExpenses.length) === 0 && (
          <p className="text-muted py-10 text-center text-sm">Nenhum lançamento encontrado.</p>
        )}
      </ul>
    </div>
  );
}
