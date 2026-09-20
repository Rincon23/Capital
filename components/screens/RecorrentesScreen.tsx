'use client';

import { useState } from 'react';
import {
  amountToInputValue,
  createId,
  formatBRL,
  formatMonthLabel,
  parseAmountInput,
  resolveSpecialCategoryLabels,
  specialCategoryLabel,
  todayISO,
  type Expense,
  type InstallmentAccounting,
  type RecurringExpense,
  type TopicConfig,
} from '@/lib/budget';
import { isModuleOn } from '@/lib/modules';
import { budgetRepository, walletRepository } from '@/lib/storage';
import { useCards } from '@/components/cards/CardsProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ExpenseFormSheet } from '@/components/month/ExpenseFormSheet';
import { useSettings } from '@/components/providers/SettingsProvider';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { InstallmentOptions, MAX_INSTALLMENTS } from '@/components/card/InstallmentOptions';
import { CardPicker } from '@/components/ui/CardPicker';
import { Chip } from '@/components/ui/Chip';
import { CategoryPicker, type CategoryValue } from '@/components/ui/CategoryPicker';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton } from '@/components/modules/ModuleHelpButton';
import { useBackHref } from '@/components/modules/useBackHref';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { useWallet } from '@/components/wallet/WalletProvider';

export function RecorrentesScreen() {
  return (
    <ModuleGate module="recurring">
      <Recorrentes />
    </ModuleGate>
  );
}

/** The name of a template's category, envelope or special. */
function categoryLabel(item: RecurringExpense, topics: TopicConfig[], labels: Parameters<typeof specialCategoryLabel>[1]): string {
  if (item.categoryKind === 'topic') {
    return topics.find((topic) => topic.id === item.topicId)?.name ?? '—';
  }
  return specialCategoryLabel(item.categoryKind, labels);
}

function Recorrentes() {
  const backHref = useBackHref('recurring');
  const { settings } = useSettings();
  const { snapshot, loading, error, month, run } = useWallet();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [creating, setCreating] = useState(false);
  /** The expense a "Lançar no mês" is about to create, shown in the normal expense form. */
  const [launching, setLaunching] = useState<{
    draft: Partial<Expense>;
    /** The split the template already decided, when it is a parcelled one. */
    installment?: { count: number; accounting: InstallmentAccounting };
  } | null>(null);
  useModuleIntro('recurring', { ready: !!snapshot });

  if (loading && !snapshot) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const labels = resolveSpecialCategoryLabels(settings?.specialCategories);
  const topics = settings?.topics ?? [];
  const items = snapshot?.recurring ?? [];

  async function handleSave(item: RecurringExpense) {
    try {
      await run(() => walletRepository.saveRecurring(item));
      showToast('Operação concluída com sucesso!');
      setEditing(null);
      setCreating(false);
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    }
  }

  async function handleDelete(item: RecurringExpense) {
    const confirmed = await confirm({
      title: 'Excluir recorrente',
      message: `Excluir o modelo "${item.description}" (${formatBRL(item.amount)})? Os gastos que você já lançou a partir dele continuam nos meses.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) {
      showToast('Operação cancelada. Nenhuma alteração foi realizada.', 'info');
      return;
    }
    await run(() => walletRepository.deleteRecurring(item.id));
    setEditing(null);
    showToast('Recorrente excluído.');
  }

  /**
   * Opens the ordinary expense form, filled from the template and with today's date (correction
   * 2). It goes in as a draft, not as an expense that already exists, so the form is the same one
   * as everywhere else — including "À vista / Parcelado" when the template is paid on the card.
   */
  function startLaunch(item: RecurringExpense) {
    const onCard = item.card && isModuleOn(settings, 'card');
    setLaunching({
      draft: {
        categoryKind: item.categoryKind,
        ...(item.topicId ? { topicId: item.topicId } : {}),
        description: item.description,
        amount: item.amount,
        date: todayISO(),
        singleInstallmentCard: onCard,
        ...(onCard && item.cardId ? { cardId: item.cardId } : {}),
        source: 'recurring',
      },
      // Um modelo parcelado abre o formulário já em "Parcelado", com o número de vezes e a
      // forma de contabilizar que ele guarda: lançar é confirmar, não preencher de novo.
      ...(onCard && item.installmentCount
        ? {
            installment: {
              count: item.installmentCount,
              accounting: item.installmentAccounting ?? 'upfront',
            },
          }
        : {}),
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader
        title="Gastos recorrentes"
        subtitle={`Lançar em ${formatMonthLabel(month)}`}
        backHref={backHref}
        action={
          <>
            <ModuleHelpButton module="recurring" />
            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="Novo recorrente"
              data-tour="recorrentes-novo"
              className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            >
              +
            </button>
          </>
        }
      />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

      <div data-tour="recorrentes-lista" className="flex flex-col">
        <ul className="flex flex-col gap-2 px-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-border bg-card flex items-center gap-2 rounded-xl border px-4 py-3 shadow-sm"
            >
              <button type="button" onClick={() => setEditing(item)} className="min-w-0 flex-1 text-left">
                <span className="text-foreground block truncate font-medium">{item.description}</span>
                <span className="text-muted block text-xs">
                  {categoryLabel(item, topics, labels)}
                  {item.card && isModuleOn(settings, 'card') ? ' · cartão' : ''}
                  {item.card && isModuleOn(settings, 'card') && item.installmentCount
                    ? ` · ${item.installmentCount}× de ${formatBRL(item.amount / item.installmentCount)}`
                    : ''}
                </span>
              </button>
              <span className="text-foreground shrink-0 font-semibold">{formatBRL(item.amount)}</span>
              <button
                type="button"
                onClick={() => startLaunch(item)}
                className="border-border text-foreground min-h-[36px] shrink-0 rounded-lg border px-3 text-sm font-medium"
              >
                Lançar
              </button>
            </li>
          ))}
        </ul>

        {items.length === 0 && (
          <p className="text-muted px-4 py-10 text-center text-sm">
            Nenhum gasto recorrente ainda. Crie um modelo para os gastos que se repetem todo mês — aluguel,
            internet, faculdade — e lance com um toque.
          </p>
        )}
      </div>

      {(creating || editing) && settings && (
        <RecurringFormSheet
          topics={topics}
          specialCategories={settings.specialCategories}
          showReimbursable={isModuleOn(settings, 'reimbursable')}
          cardEnabled={isModuleOn(settings, 'card')}
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={handleSave}
          onDelete={editing ? () => handleDelete(editing) : undefined}
        />
      )}

      {launching && settings && (
        <ExpenseFormSheet
          month={month}
          topics={topics}
          specialCategories={settings.specialCategories}
          reimbursableEnabled={isModuleOn(settings, 'reimbursable')}
          cardEnabled={isModuleOn(settings, 'card')}
          draft={launching.draft}
          allowSplit
          installmentDraft={launching.installment}
          closedMonths={snapshot?.closedMonths ?? []}
          title="Lançar recorrente"
          onClose={() => setLaunching(null)}
          onSave={async (expense) => {
            // Through `run`, so the reserva de emergência (card debt) reflects the new expense right away.
            await run(() => budgetRepository.saveExpense(month, expense));
            setLaunching(null);
            showToast('Gasto adicionado com sucesso!');
          }}
          onSaveInstallment={
            isModuleOn(settings, 'card')
              ? async (plan) => {
                  await run(() => walletRepository.saveInstallment(plan));
                  setLaunching(null);
                  showToast('Compra parcelada criada a partir do recorrente.');
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function RecurringFormSheet({
  topics,
  specialCategories,
  showReimbursable,
  cardEnabled,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  topics: TopicConfig[];
  specialCategories: Parameters<typeof resolveSpecialCategoryLabels>[0];
  showReimbursable: boolean;
  /** Without the card module the template keeps its card flag but does not ask about it. */
  cardEnabled: boolean;
  initial?: RecurringExpense;
  onClose: () => void;
  onSave: (item: RecurringExpense) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const labels = resolveSpecialCategoryLabels(specialCategories);
  const activeTopics = topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order);
  const [amount, setAmount] = useState(initial ? amountToInputValue(initial.amount) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<CategoryValue>({
    categoryKind: initial?.categoryKind ?? 'fixedCost',
    topicId: initial?.topicId ?? activeTopics[0]?.id,
  });
  const [card, setCard] = useState(initial?.card ?? false);
  const { cards, defaultCard } = useCards();
  const [cardId, setCardId] = useState<string | undefined>(
    initial ? initial.cardId : (defaultCard?.id ?? undefined),
  );
  const [splitting, setSplitting] = useState(Boolean(initial?.installmentCount));
  const [installment, setInstallment] = useState({
    count: String(initial?.installmentCount ?? 10),
    // The template has no date: the first charge is only known when it is launched.
    firstDebitDate: todayISO(),
    accounting: (initial?.installmentAccounting ?? 'upfront') as InstallmentAccounting,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const parsedAmount = parseAmountInput(amount);
  const count = Number.parseInt(installment.count, 10);
  // Parcelar é coisa de cartão: sem ele, o modelo é um gasto comum.
  const canSplit = cardEnabled && card;
  const splitCount = canSplit && splitting ? count : undefined;
  const categoryName =
    category.categoryKind === 'topic'
      ? (activeTopics.find((t) => t.id === category.topicId)?.name ?? 'a categoria')
      : labels[category.categoryKind];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problems: string[] = [];
    if (!(parsedAmount > 0)) problems.push('O valor deve ser maior que zero.');
    if (!description.trim()) problems.push('Escreva uma descrição.');
    if (category.categoryKind === 'topic' && !category.topicId) problems.push('Selecione uma categoria.');
    if (splitCount !== undefined && !(splitCount >= 2 && splitCount <= MAX_INSTALLMENTS)) {
      problems.push(`O número de parcelas vai de 2 a ${MAX_INSTALLMENTS}. Para uma vez só, escolha À vista.`);
    }
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initial?.id ?? createId(),
        categoryKind: category.categoryKind,
        ...(category.categoryKind === 'topic' ? { topicId: category.topicId } : {}),
        description: description.trim(),
        amount: parsedAmount,
        card,
        ...(card && cardId ? { cardId } : {}),
        ...(splitCount !== undefined
          ? { installmentCount: splitCount, installmentAccounting: installment.accounting }
          : {}),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open title={initial ? 'Editar recorrente' : 'Novo recorrente'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AmountInput value={amount} onChange={setAmount} autoFocus={!initial} />

        <CategoryPicker
          topics={topics}
          specialCategories={labels}
          value={category}
          onChange={setCategory}
          showReimbursable={showReimbursable}
        />

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Descrição
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Aluguel, internet, faculdade..."
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        {cardEnabled && (
          <label className="text-foreground flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={card}
              onChange={(e) => setCard(e.target.checked)}
              className="border-border h-5 w-5 rounded"
            />
            Esse gasto é pago no cartão?
          </label>
        )}

        {cardEnabled && card && <CardPicker cards={cards} value={cardId} onChange={setCardId} />}

        {canSplit && (
          <div>
            <p className="text-muted mb-2 text-sm font-medium">Como você paga?</p>
            <div className="flex flex-wrap gap-2">
              <Chip label="À vista" selected={!splitting} onClick={() => setSplitting(false)} />
              <Chip label="Parcelado" selected={splitting} onClick={() => setSplitting(true)} />
            </div>
            <p className="text-muted mt-2 text-xs">
              Um modelo parcelado já abre em &ldquo;Parcelado&rdquo; na hora de lançar, com o número
              de vezes preenchido. A data da primeira cobrança vem do cartão, no dia do lançamento.
            </p>
          </div>
        )}

        {canSplit && splitting && (
          <InstallmentOptions
            value={installment}
            onChange={setInstallment}
            totalAmount={parsedAmount}
            categoryLabel={categoryName}
            purchaseMonth={todayISO().slice(0, 7)}
            withoutFirstDebit
          />
        )}

        {errors.length > 0 && (
          <ul className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">
            {errors.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 pt-1">
          {onDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
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
