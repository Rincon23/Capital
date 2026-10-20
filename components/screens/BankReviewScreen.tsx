'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Pencil, Tag } from 'lucide-react';
import { InstallmentFormSheet } from '@/components/card/InstallmentFormSheet';
import { useCards } from '@/components/cards/CardsProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ExpenseFormSheet } from '@/components/month/ExpenseFormSheet';
import { IncomeFormSheet } from '@/components/month/IncomeFormSheet';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { useSettings } from '@/components/providers/SettingsProvider';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { useWallet, WalletProvider } from '@/components/wallet/WalletProvider';
import { entryDescription, tidyName, type BankReview, type PaybackOption, type ReviewItem } from '@/lib/banks';
import {
  formatBRL,
  formatDayMonth,
  formatMonthLabel,
  nextChargeDate,
  specialCategoryLabel,
  type CardBill,
  type Expense,
  type Income,
  type InstallmentPlan,
} from '@/lib/budget';
import { isModuleOn } from '@/lib/modules';
import { banksRepository, walletRepository, type BankReviewAction } from '@/lib/storage';
import { ApiRequestError } from '@/lib/storage/apiClient';
import { toStorageErrorMessage } from '@/lib/storage/errors';

/**
 * "Confira os gastos": what arrived from the banks and is not in the Capital yet. Each line is
 * launched with one tap when the Capital has a category to suggest, opens the very form of a
 * purchase, a split purchase or an income otherwise (and through the pencil), and can be left out.
 * Nothing becomes an entry without a tap, and no bill leaves without "Marcar paga".
 */
export function BankReviewScreen() {
  return (
    <ModuleGate module="banks">
      <WalletProvider>
        <Review />
      </WalletProvider>
    </ModuleGate>
  );
}

type FormState =
  | { kind: 'expense'; item: ReviewItem; draft: Partial<Expense> }
  | { kind: 'plan'; item: ReviewItem; draft: Partial<InstallmentPlan> }
  | { kind: 'income'; item: ReviewItem; initial: Income };

const primaryButton =
  'bg-primary text-primary-foreground flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold disabled:opacity-50';
const quietButton =
  'border-border text-foreground flex min-h-[44px] items-center justify-center rounded-lg border px-3 text-sm font-medium disabled:opacity-50';

/** The bill a payment that came from the bank looks like: still open, about the same amount. */
function billPaidBy(item: ReviewItem, bills: CardBill[]): CardBill | null {
  return (
    bills
      .filter((bill) => !bill.paid && !bill.future && Math.abs(bill.total - item.amount) <= 1)
      .sort((a, b) => Math.abs(a.total - item.amount) - Math.abs(b.total - item.amount))[0] ?? null
  );
}

function Review() {
  const { settings } = useSettings();
  const { cards } = useCards();
  const { snapshot, refresh: refreshWallet } = useWallet();
  const { showToast } = useToast();
  const [review, setReview] = useState<BankReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  /** Lines where the person said "É outro" to the duplicate the Capital pointed at. */
  const [notSame, setNotSame] = useState<Set<string>>(() => new Set());
  /** Lines where the person said the Pix is not the "A receber" the Capital pointed at. */
  const [notPayback, setNotPayback] = useState<Set<string>>(() => new Set());
  const [showIgnored, setShowIgnored] = useState(false);

  const load = useCallback(async () => {
    try {
      setReview(await banksRepository.getReview());
      setError(null);
    } catch (err) {
      setError(toStorageErrorMessage(err, 'Não foi possível abrir o que chegou dos bancos.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const header = <PageHeader title="Confira os gastos" backHref="/bancos" />;
  if (!settings) return header;

  if (!isModuleOn(settings, 'expenses')) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-10">
        {header}
        <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
          <p className="text-foreground font-semibold">Falta o módulo Lançamentos</p>
          <p className="text-muted text-sm">O que chegou dos bancos entra nos Lançamentos. Ligue o módulo para conferir.</p>
          <Link href="/modulos" className="text-primary text-sm font-semibold">
            Ver os módulos
          </Link>
        </section>
      </div>
    );
  }

  const cardOn = isModuleOn(settings, 'card');
  // Where what was missing from a payback goes (the person may have renamed it).
  const unforeseenLabel = specialCategoryLabel('unforeseen', settings.specialCategories);
  const budgetOn = isModuleOn(settings, 'budget');

  /** Sends a decision; errors go back to whoever asked (a form shows them, a tap toasts them). */
  async function send(action: BankReviewAction) {
    try {
      setReview(await banksRepository.review(action));
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ALREADY_REVIEWED') void load();
      throw err;
    }
    if (action.action === 'plan' || action.action === 'expense') void refreshWallet();
  }

  async function tap(item: ReviewItem, action: BankReviewAction, done: string) {
    setBusy(item.key);
    try {
      await send(action);
      showToast(done);
    } catch (err) {
      showToast(toStorageErrorMessage(err, 'Não foi possível concluir.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  const incomeOf = (item: ReviewItem): Income => ({
    id: crypto.randomUUID(),
    source: item.payer ? tidyName(item.payer) : entryDescription(item.description),
    amount: item.amount,
    date: item.date,
  });

  const draftOf = (item: ReviewItem): Partial<Expense> => ({
    description: entryDescription(item.description),
    amount: item.amount,
    date: item.date,
    ...(item.category ? { categoryKind: item.category.categoryKind, topicId: item.category.topicId } : {}),
    singleInstallmentCard: item.onCard && cardOn,
    ...(item.onCard && cardOn && item.cardId ? { cardId: item.cardId } : {}),
    source: 'import',
  });

  const planOf = (item: ReviewItem): Partial<InstallmentPlan> => {
    const split = item.installments!;
    const card = cards.find((candidate) => candidate.id === item.cardId);
    return {
      name: entryDescription(item.description),
      ...(item.category ? { categoryKind: item.category.categoryKind, topicId: item.category.topicId } : {}),
      purchaseDate: split.purchaseDate,
      // The Capital's own rule for the first charge of a purchase made that day on that card.
      firstDebitDate: card ? nextChargeDate(card, split.purchaseDate) : split.purchaseDate,
      count: split.count,
      totalAmount: split.total,
      accounting: 'upfront',
      cardId: item.cardId ?? undefined,
    };
  };

  /** The form a line opens (the pencil, or "Lançar" when there is something to choose). */
  function open(item: ReviewItem) {
    if (item.kind === 'income') setForm({ kind: 'income', item, initial: incomeOf(item) });
    else if (item.kind === 'plan' && cardOn) setForm({ kind: 'plan', item, draft: planOf(item) });
    else setForm({ kind: 'expense', item, draft: draftOf(item) });
  }

  function launch(item: ReviewItem) {
    if (item.kind === 'income') {
      void tap(
        item,
        { action: 'income', transactionIds: item.transactionIds, month: item.date.slice(0, 7), income: incomeOf(item) },
        'Renda lançada.',
      );
      return;
    }
    // A split purchase is always checked in its form: how it enters the budget is the person's call.
    if (item.kind === 'plan' || !item.category) {
      open(item);
      return;
    }
    const draft = draftOf(item);
    void tap(
      item,
      {
        action: 'expense',
        transactionIds: item.transactionIds,
        month: item.date.slice(0, 7),
        expense: { ...(draft as Expense), id: crypto.randomUUID(), categoryKind: item.category.categoryKind },
      },
      `Lançado em ${item.category.label}.`,
    );
  }

  // Asked only for the bank cards with something to launch now, and only once each.
  const cardsInUse = new Set((review?.items ?? []).filter((item) => item.onCard).map((item) => item.accountId));
  const unlinkedCards =
    cardOn && cards.length > 0
      ? (review?.cards ?? []).filter((card) => !card.linked && cardsInUse.has(card.accountId))
      : [];
  const bills = snapshot?.bills ?? [];

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      {header}
      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}
      {!review && !error && <div className="text-muted px-4 py-16 text-center">Carregando…</div>}

      {review && (
        <>
          <p className="text-muted px-4 text-sm">O que chegou dos bancos e ainda não está no Capital.</p>

          {unlinkedCards.length > 0 && (
            <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
              <p className="text-foreground text-sm font-semibold">Qual é cada cartão no Capital?</p>
              {unlinkedCards.map((bankCard) => (
                <div key={bankCard.accountId} className="flex flex-col gap-1.5">
                  <p className="text-muted truncate text-xs">
                    {bankCard.name} · {bankCard.bankName}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[...cards.map((card) => ({ id: card.id as string | null, label: card.name })), { id: null, label: 'Não informar' }].map(
                      (option) => (
                        <Chip
                          key={option.id ?? 'none'}
                          label={option.label}
                          selected={false}
                          onClick={() =>
                            void banksRepository
                              .linkCard(bankCard.accountId, option.id)
                              .then(load)
                              .catch((err: unknown) =>
                                showToast(toStorageErrorMessage(err, 'Não foi possível salvar.'), 'error'),
                              )
                          }
                        />
                      ),
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          {review.items.length === 0 ? (
            <section className="border-border bg-card mx-4 flex flex-col gap-1 rounded-2xl border p-4 text-center shadow-sm">
              <p className="text-foreground font-semibold">Tudo conferido ✓</p>
              <p className="text-muted text-sm">Quando os bancos mandarem novidades, elas aparecem aqui.</p>
            </section>
          ) : (
            <ul className="flex flex-col gap-3">
              {review.items.map((item) => (
                <ReviewRow
                  key={item.key}
                  item={item}
                  busy={busy !== null}
                  showDuplicate={item.duplicate !== null && !notSame.has(item.key)}
                  showPayback={item.reimbursement !== null && !notPayback.has(item.key)}
                  unforeseenLabel={unforeseenLabel}
                  onPayback={(option) =>
                    void tap(
                      item,
                      {
                        action: 'reimbursed',
                        transactionIds: item.transactionIds,
                        month: option.month,
                        expenseId: option.expenseId,
                      },
                      paybackDone(option, unforeseenLabel),
                    )
                  }
                  onNotPayback={() => setNotPayback((current) => new Set(current).add(item.key))}
                  onLaunch={() => launch(item)}
                  onEdit={() => open(item)}
                  onIgnore={() =>
                    void tap(item, { action: 'ignore', transactionIds: item.transactionIds }, 'Tirado da lista.')
                  }
                  onSame={() =>
                    void tap(
                      item,
                      {
                        action: 'linked',
                        transactionIds: item.transactionIds,
                        month: item.duplicate!.month,
                        entryId: item.duplicate!.entryId,
                      },
                      'Pronto: ligado ao que você já tinha lançado.',
                    )
                  }
                  onNotSame={() => setNotSame((current) => new Set(current).add(item.key))}
                />
              ))}
            </ul>
          )}

          {review.ignored.length > 0 && (
            <section className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowIgnored((value) => !value)}
                aria-expanded={showIgnored}
                className="text-muted flex min-h-[40px] items-center gap-1 px-4 text-sm font-semibold"
              >
                Deixados de fora ({review.ignored.length})
                <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${showIgnored ? 'rotate-180' : ''}`} />
              </button>
              {showIgnored && review.ignored.length > 1 && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void (async () => {
                      setBusy('all-ignored');
                      try {
                        // A request takes up to 48 transactions: the lines go in batches of that.
                        const ids = review.ignored.flatMap((item) => item.transactionIds);
                        for (let start = 0; start < ids.length; start += 48) {
                          await send({ action: 'ignore', transactionIds: ids.slice(start, start + 48) });
                        }
                        showToast('Deixados de fora tirados da lista.');
                      } catch (err) {
                        showToast(toStorageErrorMessage(err, 'Não foi possível tirar todos.'), 'error');
                      } finally {
                        setBusy(null);
                      }
                    })()
                  }
                  className="text-primary self-start px-4 text-sm font-semibold disabled:opacity-50"
                >
                  Tirar todos da lista
                </button>
              )}
              {showIgnored && (
                <ul className="flex flex-col gap-2">
                  {review.ignored.map((item) => {
                    const bill = item.ignored?.reason === 'bill_payment' && cardOn ? billPaidBy(item, bills) : null;
                    return (
                      <li
                        key={item.key}
                        className="border-border bg-card mx-4 flex flex-col gap-2 rounded-xl border p-3 text-sm shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="text-foreground block truncate">{entryDescription(item.description)}</span>
                            <span className="text-muted block text-xs">
                              {item.bankName} · {formatDayMonth(item.date)} · {item.ignored?.label}
                            </span>
                          </span>
                          <span className="text-foreground shrink-0 tabular-nums">{formatBRL(item.amount)}</span>
                        </div>
                        {bill && (
                          <div className="bg-background flex items-center justify-between gap-2 rounded-lg px-3 py-2">
                            <span className="text-foreground text-xs">
                              Marcar a fatura de {formatMonthLabel(bill.month)} ({bill.cardName}) como paga?
                            </span>
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() =>
                                void (async () => {
                                  setBusy(item.key);
                                  try {
                                    await walletRepository.payBill({ cardId: bill.cardId, month: bill.month });
                                    await send({ action: 'bill', transactionIds: item.transactionIds });
                                    void refreshWallet();
                                    showToast(`Fatura de ${formatMonthLabel(bill.month)} paga.`);
                                  } catch (err) {
                                    showToast(toStorageErrorMessage(err, 'Não foi possível marcar a fatura.'), 'error');
                                  } finally {
                                    setBusy(null);
                                  }
                                })()
                              }
                              className="text-primary shrink-0 text-xs font-semibold"
                            >
                              Marcar paga
                            </button>
                          </div>
                        )}
                        <div className="flex gap-4">
                          {item.ignored?.reason !== 'in_plan' && (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => open(item)}
                              className="text-primary text-xs font-semibold"
                            >
                              Lançar mesmo assim
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              void tap(item, { action: 'ignore', transactionIds: item.transactionIds }, 'Tirado da lista.')
                            }
                            className="text-muted text-xs font-medium"
                          >
                            Tirar da lista
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {form?.kind === 'expense' && (
        <ExpenseFormSheet
          month={(form.draft.date ?? form.item.date).slice(0, 7)}
          topics={settings.topics}
          specialCategories={settings.specialCategories}
          reimbursableEnabled={isModuleOn(settings, 'reimbursable')}
          cardEnabled={cardOn}
          draft={form.draft}
          title="Conferir gasto"
          onClose={() => setForm(null)}
          onSave={async (expense) => {
            await send({
              action: 'expense',
              transactionIds: form.item.transactionIds,
              month: expense.date.slice(0, 7),
              expense: { ...expense, source: 'import' },
            });
            showToast('Gasto lançado.');
          }}
        />
      )}

      {form?.kind === 'plan' && (
        <InstallmentFormSheet
          draft={form.draft}
          topics={settings.topics}
          specialCategories={settings.specialCategories}
          showReimbursable={isModuleOn(settings, 'reimbursable')}
          cards={cards}
          closedMonths={snapshot?.closedMonths ?? []}
          today={snapshot?.today}
          onClose={() => setForm(null)}
          onSave={async (plan) => {
            await send({ action: 'plan', transactionIds: form.item.transactionIds, plan });
            showToast('Compra parcelada lançada.');
          }}
        />
      )}

      {form?.kind === 'income' && (
        <IncomeFormSheet
          month={form.item.date.slice(0, 7)}
          initial={form.initial}
          topics={budgetOn ? settings.topics : undefined}
          title="Conferir renda"
          onClose={() => setForm(null)}
          onSave={async (income) => {
            await send({
              action: 'income',
              transactionIds: form.item.transactionIds,
              month: (income.date ?? form.item.date).slice(0, 7),
              income,
            });
            showToast('Renda lançada.');
          }}
        />
      )}
    </div>
  );
}

/** What "Marcar como recebido" did, said back. */
function paybackDone(option: PaybackOption, unforeseenLabel: string): string {
  const what = `“${option.description}”`;
  if (option.difference >= 0.01) {
    return `Pronto: ${what} recebido, e ${formatBRL(option.difference)} a mais entraram como renda.`;
  }
  if (option.difference <= -0.01) {
    return `Pronto: ${what} recebido, e ${formatBRL(-option.difference)} que faltaram foram para ${unforeseenLabel}.`;
  }
  return `Pronto: ${what} marcado como recebido.`;
}

/** Under "É a devolução de…?": what happens to a Pix a little off. */
function differenceLine(option: PaybackOption, unforeseenLabel: string): string | null {
  if (option.difference >= 0.01) return `Os ${formatBRL(option.difference)} a mais entram como renda.`;
  if (option.difference <= -0.01) {
    return `Os ${formatBRL(-option.difference)} que faltaram entram como gasto em ${unforeseenLabel}.`;
  }
  return null;
}

function ReviewRow({
  item,
  busy,
  showDuplicate,
  showPayback,
  unforeseenLabel,
  onPayback,
  onNotPayback,
  onLaunch,
  onEdit,
  onIgnore,
  onSame,
  onNotSame,
}: {
  item: ReviewItem;
  busy: boolean;
  showDuplicate: boolean;
  showPayback: boolean;
  unforeseenLabel: string;
  onPayback: (option: PaybackOption) => void;
  onNotPayback: () => void;
  onLaunch: () => void;
  onEdit: () => void;
  onIgnore: () => void;
  onSame: () => void;
  onNotSame: () => void;
}) {
  const income = item.kind === 'income';
  /** "É outro A receber": the other open ones close enough in value. */
  const [otherPaybacks, setOtherPaybacks] = useState(false);
  const launchLabel = income
    ? 'Lançar renda'
    : item.kind === 'plan'
      ? 'Conferir parcelado'
      : item.category
        ? 'Lançar'
        : 'Escolher categoria';
  return (
    <li className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground truncate font-semibold">{entryDescription(item.description)}</p>
          <p className="text-muted truncate text-xs">
            {item.bankName} · {item.accountName} · {formatDayMonth(item.date)}
          </p>
        </div>
        <p className={`shrink-0 font-semibold tabular-nums ${income ? 'text-success' : 'text-foreground'}`}>
          {income ? '+' : ''}
          {formatBRL(item.amount)}
        </p>
      </div>

      {item.installments && (
        <p className="text-muted text-xs">
          {item.installments.count}× de {formatBRL(item.installments.installmentAmount)} · comprada em{' '}
          {formatDayMonth(item.installments.purchaseDate)}
        </p>
      )}
      {!income && (
        <p className={`flex items-center gap-1.5 text-sm ${item.category ? 'text-foreground' : 'text-muted'}`}>
          <Tag aria-hidden className="h-3.5 w-3.5" />
          {item.category?.label ?? 'Categoria não informada'}
        </p>
      )}

      {showPayback && item.reimbursement ? (
        <div className="bg-success-bg flex flex-col gap-2 rounded-lg px-3 py-2 text-sm">
          <p className="text-success">
            É a devolução de “{item.reimbursement.description}” ({formatBRL(item.reimbursement.amount)})?
          </p>
          {differenceLine(item.reimbursement, unforeseenLabel) && (
            <p className="text-foreground text-xs">{differenceLine(item.reimbursement, unforeseenLabel)}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => item.reimbursement && onPayback(item.reimbursement)}
              className={primaryButton}
            >
              Marcar como recebido
            </button>
            <button type="button" disabled={busy} onClick={onNotPayback} className={`${quietButton} flex-1`}>
              É outra coisa
            </button>
          </div>
          {item.reimbursement.others.length > 0 && (
            <button
              type="button"
              onClick={() => setOtherPaybacks((open) => !open)}
              aria-expanded={otherPaybacks}
              className="text-primary flex min-h-[36px] items-center gap-1 self-start text-sm font-semibold"
            >
              <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${otherPaybacks ? 'rotate-180' : ''}`} />
              É outro A receber
            </button>
          )}
          {otherPaybacks && (
            <ul className="divide-border flex flex-col divide-y">
              {item.reimbursement.others.map((option) => (
                <li key={option.expenseId} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block truncate">
                      {option.description} · {formatBRL(option.amount)}
                    </span>
                    {differenceLine(option, unforeseenLabel) && (
                      <span className="text-muted block text-xs">{differenceLine(option, unforeseenLabel)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPayback(option)}
                    className={`${quietButton} min-h-[36px] shrink-0`}
                  >
                    É este
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : showDuplicate && item.duplicate ? (
        <div className="bg-warning-bg flex flex-col gap-2 rounded-lg px-3 py-2 text-sm">
          <p className="text-warning">
            Parece que você já lançou isso: “{item.duplicate.description}” ({formatBRL(item.duplicate.amount)},{' '}
            {formatDayMonth(item.duplicate.date)}).
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onSame} className={primaryButton}>
              É o mesmo
            </button>
            <button type="button" disabled={busy} onClick={onNotSame} className={`${quietButton} flex-1`}>
              É outro
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onLaunch} className={primaryButton}>
            {launchLabel}
          </button>
          <button type="button" disabled={busy} onClick={onEdit} aria-label="Editar antes de lançar" className={quietButton}>
            <Pencil aria-hidden className="h-4 w-4" />
          </button>
          <button type="button" disabled={busy} onClick={onIgnore} className={quietButton}>
            Ignorar
          </button>
        </div>
      )}
    </li>
  );
}
