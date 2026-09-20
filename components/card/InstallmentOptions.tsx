'use client';

import {
  activeDueDates,
  formatBRL,
  formatMonthLabel,
  type InstallmentAccounting,
  type Month,
} from '@/lib/budget';

const INPUT =
  'border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2';

/** The maximum the bank itself would take, and what the plan's validation allows. */
export const MAX_INSTALLMENTS = 120;

export interface InstallmentOptionsValue {
  /** Kept as text while it is being typed (it can be empty for a moment). */
  count: string;
  firstDebitDate: string;
  accounting: InstallmentAccounting;
}

/**
 * How a purchase is split: in how many times, when the first charge falls, and — the part that
 * actually changes the numbers — how it enters the budget.
 *
 * "À vista" is the recommended one and comes chosen: the whole purchase counts in the category
 * in the month it was bought, which is when the money was really committed, and the following
 * months only see the instalment on the bill. "Em parcelas" spreads it instead, so each month's
 * instalment counts in that month's category and shows up among its entries.
 */
export function InstallmentOptions({
  value,
  onChange,
  totalAmount,
  categoryLabel,
  purchaseMonth,
  lockedReason,
  lockedTo,
  paidCount,
  withoutFirstDebit = false,
}: {
  value: InstallmentOptionsValue;
  onChange: (value: InstallmentOptionsValue) => void;
  /** The whole purchase, to show what one instalment is worth. */
  totalAmount: number;
  /** The category the person chose in the form, named as they see it. */
  categoryLabel: string;
  /** The competence of the purchase date, where an "à vista" plan lands. */
  purchaseMonth: Month;
  /**
   * Why the choice is not being offered, when it is not. A purchase that started before it was
   * registered here can only be "em parcelas": "à vista" would have to write the whole amount
   * into the month it was bought, which is a month the person asked not to touch.
   */
  lockedReason?: string;
  /** The mode that applies while the choice is locked, so the summary tells the same story. */
  lockedTo?: InstallmentAccounting;
  /** Charges already paid before the purchase was registered: they are not on any bill. */
  paidCount?: number;
  /**
   * Hides "Primeira cobrança" and everything that depends on it. A recurring template is not a
   * purchase yet — the first charge is only known on the day it is launched — so it says in how
   * many times and how it enters the budget, and nothing about dates.
   */
  withoutFirstDebit?: boolean;
}) {
  const count = Number.parseInt(value.count, 10);
  const valid = count >= 2 && count <= MAX_INSTALLMENTS && totalAmount > 0;
  const each = valid ? totalAmount / count : 0;
  const accounting = lockedTo ?? value.accounting;
  // The months the bill really sees: the charges already paid before the cadastro are not among
  // them, so "de … até …" never promises a charge that will not arrive.
  const due = activeDueDates({
    firstDebitDate: value.firstDebitDate,
    count: Math.max(count || 0, 1),
    paidCount,
  });
  const firstMonth = formatMonthLabel((due[0] ?? value.firstDebitDate).slice(0, 7));
  const lastMonth = formatMonthLabel((due.at(-1) ?? value.firstDebitDate).slice(0, 7));

  return (
    <div className="border-border flex flex-col gap-5 rounded-xl border border-dashed p-3">
      <div className="flex gap-3">
        <label className="text-muted flex flex-1 flex-col gap-1.5 text-sm font-medium">
          Em quantas vezes
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={MAX_INSTALLMENTS}
            value={value.count}
            onChange={(event) => onChange({ ...value, count: event.target.value })}
            className={INPUT}
          />
        </label>
        {!withoutFirstDebit && (
          <label className="text-muted flex flex-1 flex-col gap-1.5 text-sm font-medium">
            Primeira cobrança
            <input
              type="date"
              value={value.firstDebitDate}
              onChange={(event) => onChange({ ...value, firstDebitDate: event.target.value })}
              className={INPUT}
            />
          </label>
        )}
      </div>

      {valid && (
        <p className="text-foreground -mt-3 text-sm font-medium">
          {count}× de {formatBRL(each)}
        </p>
      )}

      <div>
        <p className="text-muted mb-2 text-sm font-medium">Como entra no orçamento</p>
        {lockedReason ? (
          <p className="bg-background text-muted rounded-lg px-3 py-2 text-xs">{lockedReason}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <ModeOption
              selected={value.accounting === 'upfront'}
              onClick={() => onChange({ ...value, accounting: 'upfront' })}
              title="À vista"
              recommended
              description="O gasto inteiro conta na categoria no mês da compra; nos meses seguintes só a parcela aparece na fatura."
            />
            <ModeOption
              selected={value.accounting === 'installment'}
              onClick={() => onChange({ ...value, accounting: 'installment' })}
              title="Em parcelas"
              description="A parcela de cada mês conta na categoria daquele mês e aparece nos lançamentos dela."
            />
          </div>
        )}
        {valid && (
          <p className="text-muted mt-2 text-xs">
            {withoutFirstDebit
              ? accounting === 'upfront'
                ? `Ao lançar, ${formatBRL(totalAmount)} contam em ${categoryLabel} no mês da compra, e a fatura recebe ${formatBRL(each)} por ${count} meses.`
                : `Ao lançar, ${formatBRL(each)} contam em ${categoryLabel} por ${count} meses seguidos.`
              : accounting === 'upfront'
                ? `${formatBRL(totalAmount)} contam em ${categoryLabel} em ${formatMonthLabel(purchaseMonth)}, e a fatura recebe ${formatBRL(each)} por mês, de ${firstMonth} até ${lastMonth}.`
                : `${formatBRL(each)} contam em ${categoryLabel} todo mês, de ${firstMonth} até ${lastMonth}.`}
          </p>
        )}
      </div>
    </div>
  );
}

function ModeOption({
  selected,
  onClick,
  title,
  description,
  recommended,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  recommended?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-foreground text-sm font-semibold">{title}</span>
        {recommended && (
          <span className="bg-success-bg text-success rounded-full px-2 py-0.5 text-[11px] font-semibold">
            Recomendado
          </span>
        )}
      </span>
      <span className="text-muted text-xs">{description}</span>
    </button>
  );
}
