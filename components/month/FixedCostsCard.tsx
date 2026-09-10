import {
  formatBRL,
  resolveSpecialCategoryColors,
  type MonthSummary,
  type SpecialCategoryColors,
  type SpecialCategoryLabels,
} from '@/lib/budget';

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export function FixedCostsCard({
  summary,
  specialCategories,
  specialCategoryColors,
}: {
  summary: MonthSummary;
  specialCategories: SpecialCategoryLabels;
  specialCategoryColors: Partial<SpecialCategoryColors> | undefined;
}) {
  const colors = resolveSpecialCategoryColors(specialCategoryColors);

  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted flex items-center gap-2">
          <Dot color={colors.fixedCost} />
          {specialCategories.fixedCost}
        </span>
        <span className="text-foreground font-semibold">{formatBRL(summary.fixedTotal)}</span>
      </div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted flex items-center gap-2">
          <Dot color={colors.unforeseen} />
          {specialCategories.unforeseen}
        </span>
        <span className="text-foreground font-semibold">{formatBRL(summary.unforeseenTotal)}</span>
      </div>

      <p className="text-muted mb-2 text-xs font-medium tracking-wide uppercase">Rateio por categoria</p>
      <ul className="space-y-1.5">
        {summary.topics.map((topic) => (
          <li key={topic.topicId} className="flex items-center justify-between text-sm">
            <span className="text-muted flex items-center gap-2">
              <Dot color={topic.color} />
              {topic.name}
            </span>
            <span className="text-foreground">{formatBRL(topic.proportionalFixed)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
