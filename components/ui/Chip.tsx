'use client';

export function Chip({
  label,
  selected,
  onClick,
  tourAnchor,
  badge,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** `data-tour` anchor, when a tour points at this chip. */
  tourAnchor?: string;
  /** A small tag inside the chip, e.g. "Não recomendado" on "Fora do orçamento". */
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-tour={tourAnchor}
      className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:border-primary/50'
      }`}
    >
      {label}
      {badge && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            selected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-warning-bg text-warning'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
