import { formatBRL, splitSpending, type MonthSummary } from '@/lib/budget';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted truncate text-xs">{label}</p>
      <p className="text-foreground truncate text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * The top of Categorias: the month's income and everything spent. No "Ainda posso gastar" or
 * "Para as categorias" summed over all of them — a single total read as if the whole of it could
 * go to anything (the owner asked it out); what is left lives in each category's card. Money sent
 * to Investimentos was set aside, not spent: it has a line of its own under the two numbers.
 */
export function SummaryHeader({
  summary,
  investingTopicId,
}: {
  summary: MonthSummary;
  investingTopicId?: string;
}) {
  const { spent, invested } = splitSpending(summary, investingTopicId);
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Renda" value={formatBRL(summary.incomeTotal)} />
        <Stat label="Total gasto" value={formatBRL(spent)} />
      </div>
      {invested > 0 && (
        <p className="text-muted text-xs">
          Fora isso, você separou{' '}
          <span className="text-foreground font-medium tabular-nums">{formatBRL(invested)}</span> para
          investir.
        </p>
      )}
    </div>
  );
}
