import { formatBRL, type MonthSummary } from '@/lib/budget';

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted truncate text-[11px]">{label}</p>
      <p className="text-foreground truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * The top of Categorias: the number the screen is for — how much can still be spent this month,
 * all categories together (`balance`) — big, with a bar of how much of what the categories get
 * is already used; and, small under it, the income, what goes to the categories (the income
 * without fixed and unforeseen costs, `availableTotal`) and everything spent.
 */
export function SummaryHeader({ summary }: { summary: MonthSummary }) {
  const used =
    summary.availableTotal > 0
      ? Math.min(1, Math.max(0, (summary.availableTotal - summary.balance) / summary.availableTotal))
      : 1;
  const over = summary.balance < 0;

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <div data-tour="posso-gastar">
        <p className="text-muted text-sm">Ainda posso gastar</p>
        <p className={`text-3xl font-bold tabular-nums ${over ? 'text-danger' : 'text-success'}`}>
          {formatBRL(summary.balance)}
        </p>
        <div className="bg-border mt-2 h-2 overflow-hidden rounded-full" aria-hidden>
          <div
            className={`h-full rounded-full ${over ? 'bg-danger-fill' : used >= 0.8 ? 'bg-warning-fill' : 'bg-success-fill'}`}
            style={{ width: `${Math.round(used * 100)}%` }}
          />
        </div>
      </div>
      <div className="border-border grid grid-cols-3 gap-2 border-t pt-3">
        <SmallStat label="Renda" value={formatBRL(summary.incomeTotal)} />
        <SmallStat label="Para as categorias" value={formatBRL(summary.availableTotal)} />
        <SmallStat label="Total gasto" value={formatBRL(summary.expenseTotal)} />
      </div>
    </div>
  );
}
