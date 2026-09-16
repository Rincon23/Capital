'use client';

import { useState } from 'react';
import {
  amountToInputValue,
  createId,
  formatBRL,
  formatMonthLabel,
  isModuleOn,
  parseAmountInput,
  resolveSpecialCategoryLabels,
  specialCategoryLabel,
  todayISO,
  type Expense,
  type RecurringExpense,
  type TopicConfig,
} from '@/lib/budget';
import { budgetRepository, walletRepository } from '@/lib/storage';
import { PageHeader } from '@/components/layout/PageHeader';
import { ExpenseFormSheet } from '@/components/month/ExpenseFormSheet';
import { useSettings } from '@/components/providers/SettingsProvider';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CategoryPicker, type CategoryValue } from '@/components/ui/CategoryPicker';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { ModuleGate } from '@/components/wallet/ModuleGate';
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
  const { settings } = useSettings();
  const { snapshot, loading, error, month, run } = useWallet();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [creating, setCreating] = useState(false);
  /** The expense a "Lançar no mês" is about to create, shown in the normal expense form. */
  const [launching, setLaunching] = useState<Expense | null>(null);

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

  /** Opens the normal expense form, filled from the template and with today's date (correction 2). */
  function startLaunch(item: RecurringExpense) {
    setLaunching({
      id: createId(),
      categoryKind: item.categoryKind,
      ...(item.topicId ? { topicId: item.topicId } : {}),
      description: item.description,
      amount: item.amount,
      date: todayISO(),
      singleInstallmentCard: item.card,
      source: 'recurring',
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader
        title="Gastos recorrentes"
        subtitle={`Lançar em ${formatMonthLabel(month)}`}
        backHref="/carteira"
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label="Novo recorrente"
            className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            +
          </button>
        }
      />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

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
                {item.card ? ' · cartão' : ''}
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
          Nenhum gasto recorrente ainda. Crie um modelo para os gastos que se repetem todo mês —
          aluguel, internet, faculdade — e lance com um toque.
        </p>
      )}

      {(creating || editing) && settings && (
        <RecurringFormSheet
          topics={topics}
          specialCategories={settings.specialCategories}
          showReimbursable={isModuleOn(settings, 'reimbursable')}
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
          initial={launching}
          title="Lançar recorrente"
          onClose={() => setLaunching(null)}
          onSave={async (expense) => {
            // Through `run`, so the Caixa (card debt) reflects the new expense right away.
            await run(() => budgetRepository.saveExpense(month, expense));
            setLaunching(null);
            showToast('Gasto adicionado com sucesso!');
          }}
        />
      )}
    </div>
  );
}

function RecurringFormSheet({
  topics,
  specialCategories,
  showReimbursable,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  topics: TopicConfig[];
  specialCategories: Parameters<typeof resolveSpecialCategoryLabels>[0];
  showReimbursable: boolean;
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
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseAmountInput(amount);
    const problems: string[] = [];
    if (!(parsed > 0)) problems.push('O valor deve ser maior que zero.');
    if (!description.trim()) problems.push('Escreva uma descrição.');
    if (category.categoryKind === 'topic' && !category.topicId) problems.push('Selecione uma categoria.');
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
        amount: parsed,
        card,
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

        <label className="text-foreground flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={card}
            onChange={(e) => setCard(e.target.checked)}
            className="border-border h-5 w-5 rounded"
          />
          Esse gasto é pago no cartão?
        </label>

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
