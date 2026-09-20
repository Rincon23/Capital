'use client';

import { computeProgressState, formatBRL, type Expense, type Income } from '@/lib/budget';
import { useMonthContext } from '@/components/month/MonthContext';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { CardNote, HomeCard, HomeTile, Skeleton, Stat } from './HomeCard';

/** "05/09" */
function shortDate(iso: string | undefined): string {
  if (!iso) return '';
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

type Entry = { kind: 'expense'; item: Expense } | { kind: 'income'; item: Income };

/** Lançamentos: income and spending of the month, and the three latest entries. */
export function ExpensesHomeCard() {
  const { month, summary, monthData, error } = useMonthContext();

  const latest: Entry[] = monthData
    ? [
        ...monthData.expenses.map((item) => ({ kind: 'expense' as const, item })),
        ...monthData.incomes.map((item) => ({ kind: 'income' as const, item })),
      ]
        .sort((a, b) => (b.item.date ?? '').localeCompare(a.item.date ?? ''))
        .slice(0, 3)
    : [];

  return (
    <HomeCard module="expenses" href={`/mes/${month}/lancamentos`}>
      {error && !summary ? (
        <CardNote tone="danger">{error}</CardNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Renda" value={summary ? formatBRL(summary.incomeTotal) : null} />
            <Stat label="Total gasto" value={summary ? formatBRL(summary.expenseTotal) : null} />
          </div>
          {!monthData ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : latest.length === 0 ? (
            <CardNote>Nenhum lançamento neste mês ainda.</CardNote>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {latest.map((entry) => (
                <li
                  key={`${entry.kind}-${entry.item.id}`}
                  className="flex items-center justify-between gap-2 py-1.5 text-sm"
                >
                  <span className="text-foreground min-w-0 truncate">
                    {entry.kind === 'expense' ? entry.item.description : entry.item.source}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="text-muted text-xs">{shortDate(entry.item.date)}</span>
                    <span
                      className={`font-medium tabular-nums ${entry.kind === 'income' ? 'text-success' : 'text-foreground'}`}
                    >
                      {entry.kind === 'income' ? '+' : ''}
                      {formatBRL(entry.item.amount)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </HomeCard>
  );
}

/** Gastos por categoria: "posso gastar", the overall balance and a thin bar per category. */
export function BudgetHomeCard() {
  const { month, summary, error } = useMonthContext();

  return (
    <HomeCard module="budget" href={`/mes/${month}/categorias`}>
      {error && !summary ? (
        <CardNote tone="danger">{error}</CardNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Posso gastar" value={summary ? formatBRL(summary.availableTotal) : null} />
            <Stat
              label="Saldo geral"
              value={summary ? formatBRL(summary.balance) : null}
              tone={summary ? (summary.balance < 0 ? 'danger' : 'success') : undefined}
            />
          </div>
          {!summary ? (
            <Skeleton className="h-2 w-full" />
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.topics.map((topic) => (
                <li key={topic.topicId} className="flex items-center gap-3 text-xs">
                  <span className="text-muted w-24 shrink-0 truncate">{topic.name}</span>
                  <span className="min-w-0 flex-1">
                    <ProgressBar
                      usedPct={topic.usedPct}
                      state={computeProgressState(topic.usedPct)}
                      color={topic.color}
                    />
                  </span>
                  <span
                    className={`w-20 shrink-0 text-right tabular-nums ${topic.remaining < 0 ? 'text-danger' : 'text-muted'}`}
                  >
                    {formatBRL(topic.remaining)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </HomeCard>
  );
}

/** A receber: what other people owe back this month. */
export function ReimbursableHomeTile() {
  const { month, summary } = useMonthContext();

  return (
    <HomeTile
      module="reimbursable"
      href={`/mes/${month}/lancamentos?aba=a-receber`}
      value={summary ? formatBRL(summary.reimbursablePendingTotal) : null}
      caption="ainda devem"
    />
  );
}
