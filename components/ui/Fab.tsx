'use client';

export function Fab({
  onClick,
  label,
  variant = 'primary',
}: {
  onClick: () => void;
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 items-center gap-2 rounded-full px-5 font-semibold shadow-lg transition-transform active:scale-95 ${
        variant === 'primary'
          ? 'bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground border'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </button>
  );
}
