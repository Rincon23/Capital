'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Mic } from 'lucide-react';
import {
  amountToInputValue,
  currentMonthKey,
  monthsTouchedBy,
  nextChargeDate,
  parseAmountInput,
  resolveSpecialCategoryLabels,
  specialCategoryLabel,
  todayISO,
  validateExpense,
  type CategoryKind,
  type Expense,
  type ExpenseSource,
  type InstallmentAccounting,
  type InstallmentPlan,
  type Month,
  type SpecialCategoryLabels,
  type TopicConfig,
} from '@/lib/budget';
import { useCards } from '@/components/cards/CardsProvider';
import { ClosedMonthsNotice, closedMonthsOf } from '@/components/card/ClosedMonthsNotice';
import { InstallmentOptions, MAX_INSTALLMENTS } from '@/components/card/InstallmentOptions';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CardPicker } from '@/components/ui/CardPicker';
import { CategoryPicker } from '@/components/ui/CategoryPicker';
import { Chip } from '@/components/ui/Chip';

function defaultDateForMonth(month: Month): string {
  const today = new Date();
  if (currentMonthKey(today) === month) return todayISO(today);
  return `${month}-01`;
}

interface ExpenseFormSheetProps {
  month: Month;
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  /** Whether the "A receber" module is on for this user. */
  reimbursableEnabled?: boolean;
  /** Whether the card module is on: without it the card question is not asked. */
  cardEnabled?: boolean;
  initial?: Expense;
  /** A new expense filled in ahead (what the voice entry understood), still to be checked. */
  draft?: Partial<Expense>;
  /** Overrides the sheet's title, e.g. when the form is confirming a recurring expense. */
  title?: string;
  /** A line above the fields, e.g. the warning shown while editing a single instalment. */
  note?: ReactNode;
  defaultCategoryKind?: CategoryKind;
  /** False when the form is opened only to be shown (a tour step): no keyboard over it. */
  autoFocusAmount?: boolean;
  /**
   * Saves a purchase split into instalments. Without it the form never offers to split one —
   * that is how the voice review stays a single expense.
   */
  onSaveInstallment?: (plan: InstallmentPlan) => Promise<void>;
  /**
   * Whether "À vista / Parcelado" may be offered at all. The default is "only a purchase that
   * does not exist yet": editing a line of a month must not turn it into a series that rewrites
   * months it never touched. A recurring expense being launched *is* a new purchase, so it says
   * so explicitly and gets the choice like any other.
   */
  allowSplit?: boolean;
  /**
   * A split already decided elsewhere, which the form opens with instead of "À vista": a
   * recurring template that says it is paid in N times brings its own number and mode, so
   * launching it is a confirmation, not a form to fill again.
   */
  installmentDraft?: { count: number; accounting: InstallmentAccounting };
  /** Competences already closed: a purchase whose charges land in one is refused here too. */
  closedMonths?: Month[];
  onClose: () => void;
  onSave: (expense: Expense) => Promise<void>;
  onDelete?: (expenseId: string) => Promise<void>;
  /** When given, a microphone in the header switches to "Lançar por voz ou texto". */
  onVoice?: () => void;
}

export function ExpenseFormSheet({
  month,
  topics,
  specialCategories,
  reimbursableEnabled = false,
  cardEnabled = true,
  initial,
  draft,
  title,
  note,
  defaultCategoryKind,
  autoFocusAmount = true,
  onSaveInstallment,
  allowSplit,
  installmentDraft,
  closedMonths = [],
  onClose,
  onSave,
  onDelete,
  onVoice,
}: ExpenseFormSheetProps) {
  const activeTopics = useMemo(
    () => topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order),
    [topics],
  );
  const labels = resolveSpecialCategoryLabels(specialCategories);
  // Turning the module off never hides an expense that is already "A receber": it stays
  // editable (and the user can move it to another category) instead of becoming unreachable.
  const showReimbursable = reimbursableEnabled || initial?.categoryKind === 'reimbursable';

  const prefill: Partial<Expense> | undefined = initial ?? draft;
  const source: ExpenseSource | undefined = initial ? initial.source : draft?.source;
  const [amount, setAmount] = useState(
    prefill?.amount !== undefined ? amountToInputValue(prefill.amount) : '',
  );
  const [categoryKind, setCategoryKind] = useState<CategoryKind>(
    prefill?.categoryKind ?? defaultCategoryKind ?? 'topic',
  );
  // A draft without a category leaves the choice to the user instead of picking the first one.
  const [topicId, setTopicId] = useState<string | undefined>(
    initial?.topicId ?? (draft ? draft.topicId : activeTopics[0]?.id),
  );
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [date, setDate] = useState(prefill?.date ?? defaultDateForMonth(month));
  const [singleInstallmentCard, setSingleInstallmentCard] = useState(prefill?.singleInstallmentCard ?? false);
  const { cards, defaultCard } = useCards();
  // A new card purchase starts on the default card; one that already exists keeps its own
  // (and keeps having none, when the person chose not to say which card it was).
  const [cardId, setCardId] = useState<string | undefined>(
    prefill ? prefill.cardId : (defaultCard?.id ?? undefined),
  );
  const [splitting, setSplitting] = useState(Boolean(installmentDraft));
  const [installment, setInstallment] = useState(() => {
    // The first charge follows the card the form opened on, which is not always the default one.
    const chosen = cards.find((card) => card.id === cardId) ?? defaultCard;
    return {
      count: String(installmentDraft?.count ?? 10),
      firstDebitDate: chosen ? nextChargeDate(chosen) : todayISO(),
      accounting: (installmentDraft?.accounting ?? 'upfront') as InstallmentAccounting,
    };
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [closed, setClosed] = useState<Month[] | null>(null);
  const [saving, setSaving] = useState(false);

  const needsTopic = categoryKind === 'topic';
  // "A receber" is by definition something paid on the card for someone else.
  const forcedCard = categoryKind === 'reimbursable';
  const onCard = cardEnabled && (forcedCard || singleInstallmentCard);
  // Splitting is offered on a new card purchase only: an expense that already exists is one
  // line of a month, and turning it into a series would rewrite months it never touched.
  const canSplit = Boolean(onSaveInstallment) && onCard && (allowSplit ?? (!initial && !draft));
  const parsedAmount = parseAmountInput(amount);
  const categoryLabel =
    categoryKind === 'topic'
      ? (activeTopics.find((t) => t.id === topicId)?.name ?? 'a categoria')
      : specialCategoryLabel(categoryKind, labels);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setClosed(null);
    const result = validateExpense({ categoryKind, topicId, amount: parsedAmount, date });
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    const count = Number.parseInt(installment.count, 10);
    // "1 vez" is not a plan: it is an ordinary purchase on the card.
    const asPlan = canSplit && splitting && count >= 2;
    if (canSplit && splitting && !(count >= 2 && count <= MAX_INSTALLMENTS)) {
      setErrors([`O número de parcelas vai de 2 a ${MAX_INSTALLMENTS}. Para uma vez só, escolha À vista.`]);
      return;
    }

    const name = description.trim() || specialCategoryLabel(categoryKind, labels);
    const plan: InstallmentPlan | null = asPlan
      ? {
          id: crypto.randomUUID(),
          name,
          categoryKind,
          ...(needsTopic && topicId ? { topicId } : {}),
          firstDebitDate: installment.firstDebitDate,
          purchaseDate: date,
          count,
          totalAmount: parsedAmount,
          accounting: installment.accounting,
          ...(cardId ? { cardId } : {}),
        }
      : null;

    if (plan) {
      const blocked = monthsTouchedBy(plan).filter((m) => closedMonths.includes(m));
      if (blocked.length > 0) {
        setErrors([]);
        setClosed(blocked);
        return;
      }
    }

    setSaving(true);
    try {
      if (plan && onSaveInstallment) {
        await onSaveInstallment(plan);
      } else {
        await onSave({
          id: initial?.id ?? crypto.randomUUID(),
          categoryKind,
          topicId: needsTopic ? topicId : undefined,
          description: name,
          amount: parsedAmount,
          date,
          // With the card module off, an expense keeps whatever it already had.
          singleInstallmentCard:
            forcedCard || (cardEnabled ? singleInstallmentCard : (prefill?.singleInstallmentCard ?? false)),
          ...(cardId ? { cardId } : {}),
          source,
          // An instalment being edited on its own keeps its link to the plan.
          ...(initial?.installmentId ? { installmentId: initial.installmentId } : {}),
          ...(initial?.installmentNumber !== undefined
            ? { installmentNumber: initial.installmentNumber }
            : {}),
        });
      }
      onClose();
    } catch (err) {
      const blocked = closedMonthsOf(err);
      if (blocked) setClosed(blocked);
      else setErrors([err instanceof Error ? err.message : 'Não foi possível salvar. Tente novamente.']);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(initial.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title ?? (initial ? 'Editar gasto' : draft ? 'Conferir gasto' : 'Lançar gasto')}
      headerAction={
        onVoice && !initial && !draft ? (
          <button
            type="button"
            onClick={onVoice}
            aria-label="Lançar por voz ou texto"
            className="text-primary hover:bg-background flex h-10 w-10 items-center justify-center rounded-full"
          >
            <Mic className="h-5 w-5" aria-hidden />
          </button>
        ) : undefined
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {note && <div className="bg-background text-muted rounded-xl px-3 py-2 text-xs">{note}</div>}

        <AmountInput value={amount} onChange={setAmount} autoFocus={autoFocusAmount && !prefill} />

        <CategoryPicker
          topics={topics}
          specialCategories={labels}
          value={{ categoryKind, topicId }}
          onChange={(next) => {
            setCategoryKind(next.categoryKind);
            setTopicId(next.topicId);
          }}
          showReimbursable={showReimbursable}
        />

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Descrição
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Almoço, gasolina..."
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Data
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
          {!date.startsWith(month) && (
            <span className="text-warning text-xs">
              Essa data está fora de {month}. Tudo bem, é só um aviso.
            </span>
          )}
        </label>

        {cardEnabled && (
          <label className="text-foreground flex min-h-[44px] items-center gap-2 text-sm" data-tour="cartao-pergunta">
            <input
              type="checkbox"
              checked={forcedCard || singleInstallmentCard}
              disabled={forcedCard}
              onChange={(e) => setSingleInstallmentCard(e.target.checked)}
              className="border-border h-5 w-5 rounded disabled:opacity-60"
            />
            {forcedCard ? `${labels.reimbursable} é sempre no cartão` : 'A compra foi no cartão?'}
          </label>
        )}

        {onCard && (
          <CardPicker
            cards={cards}
            value={cardId}
            onChange={(id) => {
              setCardId(id);
              const chosen = cards.find((card) => card.id === id);
              setInstallment((current) => ({
                ...current,
                firstDebitDate: chosen ? nextChargeDate(chosen) : todayISO(),
              }));
            }}
            tourAnchor="cartao-qual"
          />
        )}

        {canSplit && (
          <div data-tour="cartao-parcelar">
            <p className="text-muted mb-2 text-sm font-medium">Como você pagou?</p>
            <div className="flex flex-wrap gap-2">
              <Chip label="À vista" selected={!splitting} onClick={() => setSplitting(false)} />
              <Chip label="Parcelado" selected={splitting} onClick={() => setSplitting(true)} />
            </div>
          </div>
        )}

        {canSplit && splitting && (
          <InstallmentOptions
            value={installment}
            onChange={setInstallment}
            totalAmount={parsedAmount}
            categoryLabel={categoryLabel}
            purchaseMonth={date.slice(0, 7)}
          />
        )}

        {closed && <ClosedMonthsNotice months={closed} onNavigate={onClose} />}

        {errors.length > 0 && (
          <ul className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 pt-1">
          {initial && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="border-danger text-danger min-h-[44px] rounded-lg border px-4 py-2 font-medium disabled:opacity-50"
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
