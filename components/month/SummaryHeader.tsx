import { formatBRL, type MonthSummary } from '@/lib/budget';

function StatTile({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: 'danger' | 'success';
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3">
      <p className="text-muted text-xs">{label}</p>
      <p
        className={`text-lg font-semibold ${
          emphasis === 'danger' ? 'text-danger' : emphasis === 'success' ? 'text-success' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function SummaryHeader({ summary }: { summary: MonthSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile label="Renda total" value={formatBRL(summary.incomeTotal)} />
      <StatTile label="Total gasto" value={formatBRL(summary.expenseTotal)} />
      <StatTile label="Posso gastar" value={formatBRL(summary.availableTotal)} />
      <StatTile
        label="Saldo geral"
        value={formatBRL(summary.balance)}
        emphasis={summary.balance < 0 ? 'danger' : 'success'}
      />
    </div>
  );
}
