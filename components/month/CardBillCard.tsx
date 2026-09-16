import { formatBRL, type MonthSummary } from '@/lib/budget';

/**
 * Credit-card bill summary: sum of every purchase flagged as a card purchase. When part of it
 * was paid for someone else ("A receber"), that share is called out — it is on the bill, but it
 * is not money the user spent.
 */
export function CardBillCard({ summary }: { summary: MonthSummary }) {
  if (summary.cardTotal <= 0) return null;

  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Gasto no cartão</span>
        <span className="text-foreground font-semibold">{formatBRL(summary.cardTotal)}</span>
      </div>
      {summary.reimbursableTotal > 0 && (
        <p className="text-muted mt-1 text-xs">
          Inclui {formatBRL(summary.reimbursableTotal)} a receber de outras pessoas.
        </p>
      )}
    </div>
  );
}
