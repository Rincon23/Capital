import { formatBRL, type MonthSummary } from '@/lib/budget';

function StatTile({
  label,
  value,
  hint,
  emphasis,
  tourId,
}: {
  label: string;
  value: string;
  /** What the number means, in a few words. */
  hint: string;
  emphasis?: 'danger' | 'success';
  tourId?: string;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3" data-tour={tourId}>
      <p className="text-muted text-xs">{label}</p>
      <p
        className={`text-lg font-semibold ${
          emphasis === 'danger' ? 'text-danger' : emphasis === 'success' ? 'text-success' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      <p className="text-muted mt-0.5 text-[11px] leading-snug">{hint}</p>
    </div>
  );
}

export function SummaryHeader({ summary }: { summary: MonthSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile
        label="Renda total"
        value={formatBRL(summary.incomeTotal)}
        hint="Tudo que entrou no mês"
      />
      <StatTile
        label="Total gasto"
        value={formatBRL(summary.expenseTotal)}
        hint="Categorias, custos fixos e imprevistos"
      />
      <StatTile
        label="Posso gastar"
        value={formatBRL(summary.availableTotal)}
        hint="A renda das categorias, já sem custos fixos e imprevistos"
        tourId="posso-gastar"
      />
      <StatTile
        label="Saldo geral"
        value={formatBRL(summary.balance)}
        hint="O que sobra depois dos gastos nas categorias"
        emphasis={summary.balance < 0 ? 'danger' : 'success'}
      />
    </div>
  );
}
