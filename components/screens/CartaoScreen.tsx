'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  billComposition,
  billKey,
  billLines,
  billLinesTotal,
  billStateLabel,
  cardLimitUse,
  computeProgressState,
  currentMonthKey,
  formatBRL,
  formatDayMonth,
  formatMonthLabel,
  formatMonthShort,
  futureInstallmentTotal,
  installmentAmount,
  installmentEndDate,
  isInstallmentFinished,
  nextMonth,
  openBills,
  plannedCharges,
  previousMonth,
  remainingInstallments,
  isUnassignedCard,
  UNASSIGNED_CARD_ID,
  UNASSIGNED_CARD_LABEL,
  type BillLine,
  type CardBill,
  type CardSettings,
  type CreditCard,
  type Expense,
  type InstallmentPlan,
  type Month,
  type MonthData,
  type SpecialCategoryLabels,
  type TopicConfig,
} from '@/lib/budget';
import { isModuleOn } from '@/lib/modules';
import { budgetRepository, walletRepository } from '@/lib/storage';
import { CardFormSheet, notifyBeforeLabel } from '@/components/card/CardFormSheet';
import { InstallmentEditor, type InstallmentEditRequest } from '@/components/card/InstallmentEditor';
import { PageHeader } from '@/components/layout/PageHeader';
import { ExpenseFormSheet } from '@/components/month/ExpenseFormSheet';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton, ModuleSettingsButton } from '@/components/modules/ModuleHelpButton';
import { ModuleSettingsSheet } from '@/components/modules/ModuleSettingsSheet';
import { useBackHref } from '@/components/modules/useBackHref';
import { useCards } from '@/components/cards/CardsProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { Chip } from '@/components/ui/Chip';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { useWallet } from '@/components/wallet/WalletProvider';

export type CardTab = 'fatura' | 'parcelados' | 'cartoes';

const TABS: { key: CardTab; label: string }[] = [
  { key: 'fatura', label: 'Fatura' },
  { key: 'parcelados', label: 'Parcelados' },
  { key: 'cartoes', label: 'Cartões' },
];

const INPUT =
  'border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2';

export function CartaoScreen({ initialTab }: { initialTab?: CardTab }) {
  return (
    <ModuleGate module="card">
      <Cartao initialTab={initialTab} />
    </ModuleGate>
  );
}

/**
 * The card, all of it, the way a bank app shows it: the bill of one competence at a time, what
 * is already committed in the months ahead, and the cards themselves.
 */
function Cartao({ initialTab }: { initialTab?: CardTab }) {
  const backHref = useBackHref('card');
  const { settings } = useSettings();
  const { snapshot, loading, error, refresh } = useWallet();
  const { refresh: refreshCards } = useCards();
  const { showToast } = useToast();
  const [tab, setTab] = useState<CardTab>(initialTab ?? 'fatura');
  const [month, setMonth] = useState<Month>(currentMonthKey);
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const loadMonth = useCallback(async () => {
    try {
      setMonthData(await budgetRepository.peekMonth(month));
    } catch {
      setMonthData(null);
    }
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMonth();
  }, [loadMonth]);

  const reload = useCallback(async () => {
    await Promise.all([refresh(), loadMonth(), refreshCards()]);
  }, [refresh, loadMonth, refreshCards]);

  if ((loading && !snapshot) || !snapshot || !settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  async function handleSettings(next: CardSettings) {
    try {
      await walletRepository.saveCardSettings(next);
      await refresh();
      showToast('Configuração salva.');
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader
        title="Cartão"
        backHref={backHref}
        action={
          <>
            <ModuleHelpButton module="card" />
            <ModuleSettingsButton module="card" onClick={() => setSettingsOpen(true)} tourAnchor="cartao-config" />
          </>
        }
      />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

      <div className="flex gap-2 overflow-x-auto px-4" data-no-swipe-nav>
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`min-h-[40px] shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${
              tab === item.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'fatura' && (
        <BillTab
          snapshot={snapshot}
          month={month}
          onMonth={setMonth}
          monthData={monthData}
          topics={settings.topics}
          specialCategories={settings.specialCategories}
          reimbursableEnabled={isModuleOn(settings, 'reimbursable')}
          onChanged={reload}
        />
      )}

      {tab === 'parcelados' && <InstallmentsTab snapshot={snapshot} topics={settings.topics} onChanged={reload} />}

      {tab === 'cartoes' && <CardsTab snapshot={snapshot} onChanged={reload} />}

      {settingsOpen && (
        <ModuleSettingsSheet module="card" onClose={() => setSettingsOpen(false)}>
          <CardSettingsSection settings={snapshot.cardSettings} onSave={handleSettings} />
          <NotificationsSection />
        </ModuleSettingsSheet>
      )}
    </div>
  );
}

type Snapshot = NonNullable<ReturnType<typeof useWallet>['snapshot']>;

// ---------------------------------------------------------------------------
// Fatura
// ---------------------------------------------------------------------------

function BillTab({
  snapshot,
  month,
  onMonth,
  monthData,
  topics,
  specialCategories,
  reimbursableEnabled,
  onChanged,
}: {
  snapshot: Snapshot;
  month: Month;
  onMonth: (month: Month) => void;
  monthData: MonthData | null;
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  reimbursableEnabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [installmentEdit, setInstallmentEdit] = useState<InstallmentEditRequest | null>(null);
  const { showToast } = useToast();

  // Só as linhas do mês que está na tela: trocando de competência, a anterior não pisca aqui.
  const lines =
    monthData?.month === month
      ? billLines({ expenses: monthData.expenses, plans: snapshot.installments, month })
      : [];
  const monthBills = snapshot.bills.filter((bill) => bill.month === month);
  const hasUnassigned =
    lines.some((line) => line.cardId === UNASSIGNED_CARD_ID) ||
    monthBills.some((bill) => bill.cardId === UNASSIGNED_CARD_ID);
  const options = [
    ...snapshot.cards.map((card) => ({ id: card.id, name: card.name })),
    ...(hasUnassigned ? [{ id: UNASSIGNED_CARD_ID, name: UNASSIGNED_CARD_LABEL }] : []),
  ];
  const visible = selected === 'all' ? lines : lines.filter((line) => line.cardId === selected);
  const total = billLinesTotal(visible);
  const composition = billComposition(visible);
  const bills = selected === 'all' ? monthBills : monthBills.filter((bill) => bill.cardId === selected);
  // Com um cartão só e nada em "Não informado", "Todos" é esse cartão: o limite aparece sem a
  // pessoa ter de escolher nada. Com as duas faturas juntas, ele espera o chip do cartão, para
  // não parecer que o limite vale também para o que está fora dele.
  const card =
    selected === 'all'
      ? (snapshot.cards.length === 1 && !hasUnassigned ? snapshot.cards[0] : undefined)
      : snapshot.cards.find((item) => item.id === selected);

  function openLine(line: BillLine) {
    if (line.installmentId && (line.virtual || line.installmentNumber === 0)) {
      setInstallmentEdit({ kind: 'plan', installmentId: line.installmentId });
    } else if (line.installmentId && line.expense) {
      setInstallmentEdit({
        kind: 'scope',
        expense: line.expense,
        installmentId: line.installmentId,
        number: line.installmentNumber ?? 1,
        count: line.installmentCount,
      });
    } else if (line.expense) {
      setEditing(line.expense);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-4" data-tour="cartao-fatura">
        <button
          type="button"
          onClick={() => onMonth(previousMonth(month))}
          aria-label="Fatura anterior"
          className="text-foreground hover:bg-card flex h-11 w-11 items-center justify-center rounded-full text-xl"
        >
          ‹
        </button>
        <span className="text-foreground text-lg font-semibold">{formatMonthLabel(month)}</span>
        <button
          type="button"
          onClick={() => onMonth(nextMonth(month))}
          aria-label="Próxima fatura"
          className="text-foreground hover:bg-card flex h-11 w-11 items-center justify-center rounded-full text-xl"
        >
          ›
        </button>
      </div>

      {options.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4" data-no-swipe-nav>
          <Chip label="Todos" selected={selected === 'all'} onClick={() => setSelected('all')} />
          {options.map((option) => (
            <Chip
              key={option.id}
              label={option.name}
              selected={selected === option.id}
              onClick={() => setSelected(option.id)}
            />
          ))}
        </div>
      )}

      <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
        <div>
          <p className="text-muted text-sm">
            {selected === 'all' ? 'Fatura do mês' : `Fatura · ${options.find((o) => o.id === selected)?.name}`}
          </p>
          <p className="text-foreground text-3xl font-bold tracking-tight tabular-nums">
            {formatBRL(total)}
          </p>
        </div>

        {card?.limit !== undefined && <LimitBar card={card} snapshot={snapshot} />}

        {bills.length === 0 ? (
          <p className="text-muted text-sm">
            {total > 0 ? 'Fatura ainda em formação.' : 'Nada nesta fatura.'}
          </p>
        ) : (
          <ul className="divide-border flex flex-col divide-y" data-tour="cartao-pagar">
            {bills.map((bill) => (
              <BillRow key={billKey(bill)} bill={bill} solo={bills.length === 1} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 px-4" data-tour="cartao-lancamentos">
        <h2 className="text-muted text-sm font-semibold">Lançamentos desta fatura</h2>
        {visible.length === 0 ? (
          <p className="border-border text-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhuma compra nesta fatura.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {visible.map((line) => (
                <li key={`${line.cardId}:${line.id}`}>
                  <button
                    type="button"
                    onClick={() => openLine(line)}
                    className="border-border bg-card flex min-h-[56px] w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left shadow-sm"
                  >
                    <span className="min-w-0">
                      <span className="text-foreground block truncate font-medium">{line.description}</span>
                      <span className="text-muted block text-xs">
                        {formatDayMonth(line.date)}
                        {selected === 'all' && ` · ${cardNameFor(snapshot.cards, line.cardId)}`}
                        {line.virtual && ' · ainda não lançada'}
                      </span>
                    </span>
                    <span className="text-foreground shrink-0 font-semibold tabular-nums">
                      {formatBRL(line.amount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-muted text-xs">
              {formatBRL(composition.purchases)} em compras · {formatBRL(composition.installments)} em
              parcelas
            </p>
          </>
        )}
      </section>

      {editing && (
        <ExpenseFormSheet
          month={month}
          topics={topics}
          specialCategories={specialCategories}
          reimbursableEnabled={reimbursableEnabled}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (expense) => {
            await budgetRepository.saveExpense(month, expense);
            await onChanged();
            showToast('Gasto salvo.');
          }}
          onDelete={async (id) => {
            await budgetRepository.deleteExpense(month, id);
            await onChanged();
            showToast('Gasto excluído.');
          }}
        />
      )}

      {installmentEdit && (
        <InstallmentEditor
          request={installmentEdit}
          data={{
            plans: snapshot.installments,
            cards: snapshot.cards,
            closedMonths: snapshot.closedMonths,
          }}
          onClose={() => setInstallmentEdit(null)}
          onChanged={onChanged}
          onEditSingle={(expense) => {
            setInstallmentEdit(null);
            setEditing(expense);
          }}
        />
      )}
    </div>
  );
}

function cardNameFor(cards: CreditCard[], cardId: string): string {
  return cards.find((card) => card.id === cardId)?.name ?? UNASSIGNED_CARD_LABEL;
}

/** One bill of the competence: when it is due, how it stands and the button that settles it. */
function BillRow({
  bill,
  solo,
  onChanged,
}: {
  bill: CardBill;
  solo: boolean;
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      showToast(message);
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handlePay() {
    const confirmed = await confirm({
      title: 'Fatura paga',
      message: (
        <>
          Marcar a fatura de <strong>{bill.cardName}</strong> ({formatMonthLabel(bill.month)}),{' '}
          {formatBRL(bill.total)}, como paga? Ela sai da dívida na Reserva de emergência
          {isUnassignedCard(bill.cardId) ? '.' : ' e os avisos param.'}
        </>
      ),
      confirmLabel: 'Fatura paga',
      cancelLabel: 'Ainda não',
    });
    if (!confirmed) return;
    await run(
      () => walletRepository.payBill({ cardId: bill.cardId, month: bill.month }),
      'Fatura marcada como paga.',
    );
  }

  const when = bill.dueDate ? `vence em ${formatDayMonth(bill.dueDate)}` : 'sem data de vencimento';

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        {!solo && <p className="text-foreground truncate text-sm font-medium">{bill.cardName}</p>}
        <p className="text-muted text-xs">
          {when} · {billStateLabel(bill)}
          {bill.postponedFrom && ' · caiu num fim de semana'}
        </p>
        {!solo && <p className="text-foreground text-sm tabular-nums">{formatBRL(bill.total)}</p>}
      </div>
      {bill.paid ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              () => walletRepository.unpayBill({ cardId: bill.cardId, month: bill.month }),
              'Fatura marcada como não paga.',
            )
          }
          className="text-primary min-h-[40px] shrink-0 text-sm font-semibold disabled:opacity-50"
        >
          Marcar como não paga
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || bill.future}
          onClick={() => void handlePay()}
          className="bg-primary text-primary-foreground min-h-[40px] shrink-0 rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
        >
          Fatura paga
        </button>
      )}
    </li>
  );
}

/** How much of the limit is still free, when the person chose to track one. */
function LimitBar({ card, snapshot }: { card: CreditCard; snapshot: Snapshot }) {
  const month = currentMonthKey();
  const open = snapshot.bills
    .filter((bill) => bill.cardId === card.id && !bill.paid && !bill.future)
    .reduce((sum, bill) => sum + bill.total, 0);
  const use = cardLimitUse(card.limit ?? 0, open, futureInstallmentTotal(snapshot.installments, month, card.id));

  return (
    <div className="flex flex-col gap-1.5">
      <p className={`text-sm font-medium ${use.over ? 'text-danger' : 'text-foreground'}`}>
        {use.over
          ? `${formatBRL(Math.abs(use.available))} acima do limite`
          : `${formatBRL(use.available)} de ${formatBRL(use.limit)} disponíveis`}
      </p>
      <ProgressBar usedPct={use.usedPct} state={use.over ? 'danger' : computeProgressState(use.usedPct)} />
      <p className="text-muted text-xs">
        já descontadas as faturas em aberto e as parcelas que ainda vão cair
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parcelados
// ---------------------------------------------------------------------------

function InstallmentsTab({
  snapshot,
  topics,
  onChanged,
}: {
  snapshot: Snapshot;
  topics: TopicConfig[];
  onChanged: () => Promise<void>;
}) {
  const [showFinished, setShowFinished] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const today = snapshot.today;
  const month = currentMonthKey();
  const plans = [...snapshot.installments].sort(
    (a, b) => remainingInstallments(a, today) - remainingInstallments(b, today) || a.name.localeCompare(b.name, 'pt-BR'),
  );
  const active = plans.filter((plan) => !isInstallmentFinished(plan, today));
  const finished = plans.filter((plan) => isInstallmentFinished(plan, today));

  const charges = plannedCharges(snapshot.installments);
  const openKeys = new Set(openBills(snapshot.bills).map(billKey));
  const inOpenBills = charges
    .filter((charge) => openKeys.has(`${charge.cardId}:${charge.month}`))
    .reduce((sum, charge) => sum + charge.amount, 0);
  const ahead = futureInstallmentTotal(snapshot.installments, month);

  const nextMonths = new Map<Month, number>();
  for (const charge of charges) {
    if (charge.month <= month) continue;
    nextMonths.set(charge.month, (nextMonths.get(charge.month) ?? 0) + charge.amount);
  }

  function planRow(plan: InstallmentPlan) {
    const left = remainingInstallments(plan, today);
    const topic = plan.topicId ? topics.find((item) => item.id === plan.topicId)?.name : undefined;
    return (
      <li key={plan.id}>
        <button
          type="button"
          onClick={() => setEditing(plan.id)}
          className="border-border bg-card flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate font-medium">{plan.name}</p>
            <p className="text-muted text-xs">
              {cardNameFor(snapshot.cards, plan.cardId ?? UNASSIGNED_CARD_ID)}
              {topic ? ` · ${topic}` : ''} · {left} de {plan.count} a pagar · fim{' '}
              {formatMonthShort(installmentEndDate(plan).slice(0, 7))}
            </p>
            <p className="text-muted text-xs">
              {plan.accounting === 'upfront'
                ? `à vista · o gasto já entrou em ${formatMonthShort((plan.purchaseDate ?? plan.firstDebitDate).slice(0, 7))}`
                : `em parcelas · ${formatBRL(installmentAmount(plan))} por mês${topic ? ` em ${topic}` : ''}`}
            </p>
          </div>
          <p className="text-foreground shrink-0 font-semibold tabular-nums">
            {formatBRL(installmentAmount(plan))}
          </p>
        </button>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-tour="cartao-aba-parcelados">
      <section className="border-border bg-card mx-4 flex flex-col gap-2 rounded-2xl border p-4 shadow-sm">
        <p className="text-muted text-sm">Já comprometido</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background rounded-xl px-3 py-2">
            <p className="text-muted text-xs">Nas faturas em aberto</p>
            <p className="text-foreground text-base font-semibold tabular-nums">{formatBRL(inOpenBills)}</p>
          </div>
          <div className="bg-background rounded-xl px-3 py-2">
            <p className="text-muted text-xs">Nos próximos meses</p>
            <p className="text-foreground text-base font-semibold tabular-nums">{formatBRL(ahead)}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 px-4">
        <h2 className="text-muted text-sm font-semibold">Compras parceladas</h2>
        {active.length === 0 ? (
          <p className="border-border text-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhuma compra parcelada em andamento. Ao lançar um gasto no cartão, escolha
            &ldquo;Parcelado&rdquo; para criar uma.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">{active.map(planRow)}</ul>
        )}
      </section>

      {nextMonths.size > 0 && (
        <section className="flex flex-col gap-2 px-4">
          <h2 className="text-muted text-sm font-semibold">Próximas faturas</h2>
          <ul className="border-border bg-card divide-border flex flex-col divide-y rounded-xl border px-4 shadow-sm">
            {[...nextMonths.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(0, 12)
              .map(([key, amount]) => (
                <li key={key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-muted">{formatMonthLabel(key)}</span>
                  <span className="text-foreground font-medium tabular-nums">{formatBRL(amount)}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <section className="px-4">
          <button
            type="button"
            onClick={() => setShowFinished((open) => !open)}
            className="border-border text-muted min-h-[44px] w-full rounded-lg border text-sm font-medium"
          >
            {showFinished ? 'Ocultar' : 'Mostrar'} encerrados ({finished.length})
          </button>
          {showFinished && <ul className="mt-2 flex flex-col gap-2 opacity-60">{finished.map(planRow)}</ul>}
        </section>
      )}

      {editing && (
        <InstallmentEditor
          request={{ kind: 'plan', installmentId: editing }}
          data={{
            plans: snapshot.installments,
            cards: snapshot.cards,
            closedMonths: snapshot.closedMonths,
          }}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
          onEditSingle={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------

function CardsTab({ snapshot, onChanged }: { snapshot: Snapshot; onChanged: () => Promise<void> }) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null);
  const { cards } = snapshot;

  async function write(action: () => Promise<void>, message: string) {
    try {
      await action();
      await onChanged();
      showToast(message);
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    }
  }

  async function handleDelete(card: CreditCard) {
    const confirmed = await confirm({
      title: 'Excluir cartão',
      message: (
        <>
          Excluir <strong>{card.name}</strong>? As compras já lançadas continuam onde estão: elas
          só deixam de pertencer a este cartão e passam para a fatura &ldquo;{UNASSIGNED_CARD_LABEL}
          &rdquo;, que você marca como paga quando quiser.
        </>
      ),
      confirmLabel: 'Excluir',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) {
      showToast('Operação cancelada. Nenhuma alteração foi realizada.', 'info');
      return;
    }
    await write(() => walletRepository.deleteCard(card.id), 'Cartão excluído.');
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-3" data-tour="cartao-aba-cartoes">
      <section className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-muted text-sm font-semibold">Seus cartões</h2>
          <button
            type="button"
            onClick={() => setEditing('new')}
            aria-label="Novo cartão"
            className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            +
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 text-sm shadow-sm">
            <p className="text-muted">
              Cadastre um cartão para dizer quando a fatura vence, ser avisado antes e acompanhar o
              limite. Sem nenhum cartão, as compras no cartão entram na fatura &ldquo;
              {UNASSIGNED_CARD_LABEL}&rdquo;, que também só sai quando você marcar como paga.
            </p>
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 text-sm font-semibold"
            >
              Cadastrar cartão
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {cards.map((card) => (
              <li key={card.id} className="border-border bg-card rounded-xl border shadow-sm">
                <button
                  type="button"
                  onClick={() => setEditing(card)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate font-medium">
                      {card.name}
                      {card.isDefault && cards.length > 1 && (
                        <span className="text-muted text-xs font-normal"> · padrão</span>
                      )}
                    </p>
                    <p className="text-muted text-xs">
                      Vence dia {card.dueDay} {card.dueMonth === 'next' ? 'do mês seguinte' : 'do mês'} ·{' '}
                      {card.notifyEnabled ? notifyBeforeLabel(card.notifyBeforeDays).toLowerCase() : 'sem aviso'}
                      {card.limit !== undefined && ` · limite de ${formatBRL(card.limit)}`}
                    </p>
                  </div>
                  <span className="text-muted shrink-0 text-sm">Editar</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-muted px-4 text-xs">
        A fatura &ldquo;{UNASSIGNED_CARD_LABEL}&rdquo; junta as compras em que você preferiu não
        dizer o cartão. Ela funciona como qualquer outra: fica na dívida até você marcar como paga.
      </p>

      {editing && (
        <CardFormSheet
          initial={editing === 'new' ? undefined : editing}
          isFirst={cards.length === 0}
          order={cards.length}
          onClose={() => setEditing(null)}
          onSave={async (card) => {
            await write(() => walletRepository.saveCard(card), 'Cartão salvo.');
            setEditing(null);
          }}
          onDelete={editing === 'new' ? undefined : () => handleDelete(editing)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configurações do módulo
// ---------------------------------------------------------------------------

function CardSettingsSection({
  settings,
  onSave,
}: {
  settings: CardSettings;
  onSave: (settings: CardSettings) => Promise<void>;
}) {
  const [notifyTime, setNotifyTime] = useState(settings.notifyTime);

  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-muted text-sm font-semibold">Avisos da fatura</h2>
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-sm">
        <label className="text-muted flex items-center justify-between gap-3 text-sm font-medium">
          Horário do aviso
          <input
            type="time"
            value={notifyTime}
            onChange={(event) => {
              setNotifyTime(event.target.value);
              if (/^\d{2}:\d{2}$/.test(event.target.value)) {
                void onSave({ ...settings, notifyTime: event.target.value });
              }
            }}
            className={`${INPUT} w-32`}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-foreground text-sm font-medium">Insistir até marcar como paga</p>
            <p className="text-muted text-xs">
              Um aviso por dia, por até uma semana depois do vencimento, enquanto a fatura estiver em
              aberto.
            </p>
          </div>
          <Switch
            checked={settings.repeatUntilPaid}
            label="Insistir até marcar como paga"
            onChange={(checked) => void onSave({ ...settings, repeatUntilPaid: checked })}
          />
        </div>
      </div>
    </section>
  );
}
