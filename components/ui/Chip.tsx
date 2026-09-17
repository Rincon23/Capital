'use client';

export function Chip({
  label,
  selected,
  onClick,
  tourAnchor,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** `data-tour` anchor, when a tour points at this chip. */
  tourAnchor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-tour={tourAnchor}
      className={`min-h-[44px] shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:border-primary/50'
      }`}
    >
      {label}
    </button>
  );
}
