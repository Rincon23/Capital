'use client';

import { useState } from 'react';
import {
  amountToInputValue,
  createId,
  formatDayMonth,
  installmentDueDates,
  monthsTouchedBy,
  nextChargeDate,
  parseAmountInput,
  resolveSpecialCategoryLabels,
  todayISO,
  type CreditCard,
  type InstallmentAccounting,
  type InstallmentPlan,
  type Month,
  type SpecialCategoryLabels,
  type TopicConfig,
} from '@/lib/budget';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CardPicker } from '@/components/ui/CardPicker';
import { CategoryPicker, type CategoryValue } from '@/components/ui/CategoryPicker';
import { ClosedMonthsNotice, closedMonthsOf } from './ClosedMonthsNotice';
import { InstallmentOptions, MAX_INSTALLMENTS } from './InstallmentOptions';

const INPUT =
  'border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2';

/** What to do with the charges of a purchase that started before it was registered here. */
type PastMode = 'skip' | 'retro';

const LOCKED_ACCOUNTING =
  'Como parte da compra já foi paga antes do cadastro, o que falta entra mês a mês: a parcela de cada mês conta na categoria daquele mês. "À vista" teria de lançar a compra inteira no mês em que ela foi feita, que é justamente o passado que você pediu para não mexer.';

/**
 * The whole purchase: what it was, how much it cost, in how many times, on which card, in which
 * category and how it enters the budget. Saving it rebuilds every month of the series, which is
 * what makes changing the mode (or the category, or the card) move the money — and what undoes
 * an adjustment made to a single instalment by hand.
 *
 * Without a `plan` it is the same form creating one from scratch, which is how a purchase made
 * months ago gets in: the first charge can be any day in the past, and the charges that already
 * fell are either left out of the app (the months that passed stay as they are) or launched
 * retroactively, whichever the person chooses.
 */
export function InstallmentFormSheet({
  plan,
  topics,
  specialCategories,
  showReimbursable,
  cards,
  closedMonths,
  today = todayISO(),
  onClose,
  onSave,
  onDelete,
}: {
  /** The purchase being edited; absent when a new one is being registered. */
  plan?: InstallmentPlan;
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  showReimbursable: boolean;
  cards: CreditCard[];
  closedMonths: Month[];
  /** The day the server calls "hoje", so both sides agree on which charges already fell. */
  today?: string;
  onClose: () => void;
  onSave: (plan: InstallmentPlan) => Promise<void>;
  onDelete?: (plan: InstallmentPlan) => Promise<void>;
}) {
  const labels = resolveSpecialCategoryLabels(specialCategories);
  const activeTopics = topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order);
  const defaultCard = cards.find((card) => card.isDefault) ?? cards[0];
  const [id] = useState(() => plan?.id ?? createId());
  const [name, setName] = useState(plan?.name ?? '');
  const [total, setTotal] = useState(plan ? amountToInputValue(plan.totalAmount) : '');
  const [purchaseDate, setPurchaseDate] = useState(plan?.purchaseDate ?? plan?.firstDebitDate ?? today);
  const [cardId, setCardId] = useState<string | undefined>(plan ? plan.cardId : defaultCard?.id);
  const [category, setCategory] = useState<CategoryValue>({
    categoryKind: plan?.categoryKind ?? 'topic',
    topicId: plan?.topicId ?? activeTopics[0]?.id,
  });
  const [installment, setInstallment] = useState({
    count: String(plan?.count ?? 10),
    firstDebitDate:
      plan?.firstDebitDate ?? (defaultCard ? nextChargeDate(defaultCard) : today),
    accounting: (plan?.accounting ?? 'upfront') as InstallmentAccounting,
  });
  const [pastMode, setPastMode] = useState<PastMode>('skip');
  const [paid, setPaid] = useState(String(plan?.paidCount ?? ''));
  /** "Adiantar parcelas" tocado por engano: salvar devolve as parcelas ao parcelamento. */
  const [undoAdvance, setUndoAdvance] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [closed, setClosed] = useState<Month[] | null>(null);
  const [saving, setSaving] = useState(false);

  const parsedTotal = parseAmountInput(total);
  const count = Number.parseInt(installment.count, 10);
  const validCount = count >= 2 && count <= MAX_INSTALLMENTS;
  // The charges that already fell, by the schedule the person typed: the number the "já pagas"
  // field starts from, and what says whether this purchase started before the app knew about it.
  const alreadyFell = validCount
    ? installmentDueDates({ firstDebitDate: installment.firstDebitDate, count }).filter(
        (due) => due <= today,
      ).length
    : 0;
  const startedInThePast = alreadyFell > 0;
  const typedPaid = paid.trim() === '' ? alreadyFell : Number.parseInt(paid, 10);
  const paidCount =
    startedInThePast && pastMode === 'skip' ? Math.min(Math.max(0, typedPaid || 0), count) : 0;
  // A purchase that starts mid-way can only be "em parcelas" (see LOCKED_ACCOUNTING).
  const accounting: InstallmentAccounting = paidCount > 0 ? 'installment' : installment.accounting;

  const categoryLabel =
    category.categoryKind === 'topic'
      ? (activeTopics.find((t) => t.id === category.topicId)?.name ?? 'a categoria')
      : labels[category.categoryKind];

  function build(): InstallmentPlan {
    return {
      id,
      name: name.trim(),
      categoryKind: category.categoryKind,
      ...(category.categoryKind === 'topic' && category.topicId ? { topicId: category.topicId } : {}),
      firstDebitDate: installment.firstDebitDate,
      purchaseDate,
      count,
      totalAmount: parsedTotal,
      accounting,
      ...(cardId ? { cardId } : {}),
      ...(paidCount > 0 ? { paidCount } : {}),
      // "Adiantar parcelas" is its own operation; editing the purchase never undoes one by
      // accident — only the button that says so does.
      ...(plan?.advancedCount && !undoAdvance ? { advancedCount: plan.advancedCount } : {}),
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problems: string[] = [];
    if (!name.trim()) problems.push('Escreva o nome da compra.');
    if (!(parsedTotal > 0)) problems.push('O valor total deve ser maior que zero.');
    if (!validCount) problems.push(`O número de parcelas vai de 2 a ${MAX_INSTALLMENTS}.`);
    if (category.categoryKind === 'topic' && !category.topicId) problems.push('Selecione uma categoria.');
    const advanced = undoAdvance ? 0 : (plan?.advancedCount ?? 0);
    if (validCount && paidCount + advanced >= count) {
      problems.push('Deixe pelo menos uma parcela por pagar: uma compra já quitada não tem o que acompanhar.');
    }
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    const blocked = monthsTouchedBy(build()).filter((month) => closedMonths.includes(month));
    if (blocked.length > 0) {
      setClosed(blocked);
      return;
    }

    setSaving(true);
    setClosed(null);
    try {
      await onSave(build());
      onClose();
    } catch (err) {
      const fromServer = closedMonthsOf(err);
      if (fromServer) setClosed(fromServer);
      else setErrors([err instanceof Error ? err.message : 'Não foi possível salvar. Tente novamente.']);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!plan || !onDelete) return;
    const blocked = monthsTouchedBy(plan).filter((month) => closedMonths.includes(month));
    if (blocked.length > 0) {
      setClosed(blocked);
      return;
    }
    setSaving(true);
    setClosed(null);
    try {
      await onDelete(plan);
      onClose();
    } catch (err) {
      const fromServer = closedMonthsOf(err);
      if (fromServer) setClosed(fromServer);
      else setErrors([err instanceof Error ? err.message : 'Não foi possível excluir. Tente novamente.']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open title={plan ? 'Editar a compra' : 'Nova compra parcelada'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AmountInput value={total} onChange={setTotal} label="Valor total da compra" autoFocus={!plan} />

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Nome da compra
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Notebook, faculdade..."
            className={INPUT}
          />
        </label>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Data da compra
          <input
            type="date"
            value={purchaseDate}
            onChange={(event) => setPurchaseDate(event.target.value)}
            className={INPUT}
          />
          <span className="text-muted text-xs">Pode ser de meses atrás: é o dia em que você comprou.</span>
        </label>

        <CategoryPicker
          topics={topics}
          specialCategories={labels}
          value={category}
          onChange={setCategory}
          showReimbursable={showReimbursable}
        />

        <CardPicker cards={cards} value={cardId} onChange={setCardId} />

        <InstallmentOptions
          value={installment}
          onChange={setInstallment}
          totalAmount={parsedTotal}
          categoryLabel={categoryLabel}
          purchaseMonth={(purchaseDate || today).slice(0, 7)}
          lockedReason={paidCount > 0 ? LOCKED_ACCOUNTING : undefined}
          lockedTo={paidCount > 0 ? 'installment' : undefined}
          paidCount={paidCount}
        />

        {startedInThePast && (
          <PastChargesSection
            firstDebitDate={installment.firstDebitDate}
            alreadyFell={alreadyFell}
            count={count}
            mode={pastMode}
            onMode={setPastMode}
            paid={paid === '' ? String(alreadyFell) : paid}
            onPaid={setPaid}
          />
        )}

        {plan?.advancedCount ? (
          <AdvanceUndoSection
            name={plan.name}
            advanced={plan.advancedCount}
            undo={undoAdvance}
            onUndo={setUndoAdvance}
          />
        ) : null}

        {plan && (
          <p className="text-muted text-xs">
            Salvar refaz os meses desta compra: se você tinha ajustado uma parcela na mão, ela volta
            ao valor do parcelamento.
          </p>
        )}

        {closed && <ClosedMonthsNotice months={closed} onNavigate={onClose} />}

        {errors.length > 0 && (
          <ul className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">
            {errors.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 pt-1">
          {plan && onDelete && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={saving}
              className="border-danger text-danger min-h-[44px] rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
            >
              Excluir
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-primary-foreground min-h-[44px] flex-1 rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

/**
 * Undoing an advance. Nothing in Capital is a one-way door: a bill marked as paid can be marked
 * as not paid, and parcelas brought forward by mistake can go back to the plan. What was paid is
 * an entry of its own, so it stays where it is — the person decides whether it was real.
 */
function AdvanceUndoSection({
  name,
  advanced,
  undo,
  onUndo,
}: {
  name: string;
  advanced: number;
  undo: boolean;
  onUndo: (undo: boolean) => void;
}) {
  return (
    <div className="border-border flex flex-col gap-3 rounded-xl border border-dashed p-3">
      <div>
        <p className="text-foreground text-sm font-semibold">
          {advanced === 1 ? 'Uma parcela adiantada' : `${advanced} parcelas adiantadas`}
        </p>
        <p className="text-muted mt-0.5 text-xs">
          {undo
            ? `Ao salvar, essas ${advanced === 1 ? 'parcela volta' : 'parcelas voltam'} para o fim do parcelamento. O lançamento "Adiantamento · ${name}" continua no mês em que você pagou — exclua-o em Lançamentos se ele não deveria estar lá.`
            : 'Elas saíram do fim do parcelamento e não aparecem em nenhuma fatura.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onUndo(!undo)}
        className={`min-h-[44px] rounded-lg border px-4 text-sm font-semibold ${
          undo ? 'border-primary bg-primary/5 text-primary' : 'border-border text-foreground'
        }`}
      >
        {undo ? 'Manter o adiantamento' : 'Desfazer o adiantamento'}
      </button>
    </div>
  );
}

/**
 * A purchase whose first charge is already behind us. The app never guesses what to do with the
 * charges that fell before it knew about the purchase: either they stay out of everything — the
 * months that already passed keep exactly the numbers they have — or the whole series is launched
 * retroactively, which is honest too, as long as no month in the way is closed.
 */
function PastChargesSection({
  firstDebitDate,
  alreadyFell,
  count,
  mode,
  onMode,
  paid,
  onPaid,
}: {
  firstDebitDate: string;
  alreadyFell: number;
  count: number;
  mode: PastMode;
  onMode: (mode: PastMode) => void;
  paid: string;
  onPaid: (value: string) => void;
}) {
  return (
    <div className="border-border flex flex-col gap-4 rounded-xl border border-dashed p-3">
      <div>
        <p className="text-foreground text-sm font-semibold">Essa compra já começou</p>
        <p className="text-muted mt-0.5 text-xs">
          A primeira cobrança foi em {formatDayMonth(firstDebitDate)}, então{' '}
          {alreadyFell === 1 ? 'uma parcela já caiu' : `${alreadyFell} parcelas já caíram`}. Diga o que
          fazer com elas.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <PastOption
          selected={mode === 'skip'}
          onClick={() => onMode('skip')}
          title="Começar a contar de agora"
          recommended
          description="As parcelas já pagas não entram em lugar nenhum: o orçamento e as faturas dos meses que já passaram ficam exatamente como estão. Só o que ainda falta aparece na fatura e na dívida."
        />
        <PastOption
          selected={mode === 'retro'}
          onClick={() => onMode('retro')}
          title="Lançar tudo retroativo"
          description="Todas as parcelas entram nos meses em que caíram, nos meses que já existem no app. Muda o orçamento e as faturas desses meses, e um mês fechado impede o cadastro."
        />
      </div>

      {mode === 'skip' && (
        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Parcelas já pagas
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={Math.max(0, count - 1)}
            value={paid}
            onChange={(event) => onPaid(event.target.value)}
            className={`${INPUT} w-28`}
          />
          <span className="text-muted text-xs">
            Contadas do começo. Ajuste se você pagou mais (ou menos) do que as {alreadyFell} que já
            venceram.
          </span>
        </label>
      )}
    </div>
  );
}

function PastOption({
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
