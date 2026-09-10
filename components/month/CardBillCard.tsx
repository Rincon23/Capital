import { formatBRL, type MonthSummary } from '@/lib/budget';

/**
 * Credit-card bill summary. Separate from the envelope budget on purpose:
 * reimbursed purchases land here (and on the real bill) but never in "Total gasto".
 */
export function CardBillCard({ summary }: { summary: MonthSummary }) {
  if (summary.cardTotal <= 0) return null;

  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Gasto no cartão</span>
        <span className="text-foreground font-semibold">{formatBRL(summary.cardTotal)}</span>
      </div>
      {summary.reimbursedTotal > 0 && (
        <div className="text-muted mt-1.5 flex items-center justify-between text-xs">
          <span>Ressarcido (te devolvem depois)</span>
          <span>{formatBRL(summary.reimbursedTotal)}</span>
        </div>
      )}
    </div>
  );
}
