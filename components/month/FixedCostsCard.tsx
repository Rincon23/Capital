import { formatBRL, type MonthSummary, type SpecialCategoryLabels } from '@/lib/budget';

export function FixedCostsCard({
  summary,
  specialCategories,
}: {
  summary: MonthSummary;
  specialCategories: SpecialCategoryLabels;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted">{specialCategories.fixedCost}</span>
        <span className="text-foreground font-semibold">{formatBRL(summary.fixedTotal)}</span>
      </div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted">{specialCategories.unforeseen}</span>
        <span className="text-foreground font-semibold">{formatBRL(summary.unforeseenTotal)}</span>
      </div>

      <p className="text-muted mb-2 text-xs font-medium tracking-wide uppercase">Rateio por categoria</p>
      <ul className="space-y-1.5">
        {summary.topics.map((topic) => (
          <li key={topic.topicId} className="flex items-center justify-between text-sm">
            <span className="text-muted">{topic.name}</span>
            <span className="text-foreground">{formatBRL(topic.proportionalFixed)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
