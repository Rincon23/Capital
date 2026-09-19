'use client';

export function AmountInput({
  value,
  onChange,
  autoFocus,
  label = 'Valor em reais',
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  /** Names the field when the sheet has more than one amount (e.g. "Valor total da compra"). */
  label?: string;
}) {
  return (
    <div className="border-border bg-background focus-within:ring-primary flex items-center gap-2 rounded-xl border px-4 py-3 focus-within:ring-2">
      <span className="text-muted text-xl font-semibold">R$</span>
      <input
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder="0,00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-foreground w-full bg-transparent text-3xl font-semibold outline-none"
        aria-label={label}
      />
    </div>
  );
}
