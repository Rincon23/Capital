'use client';

import { useState } from 'react';
import {
  createId,
  currentMonthKey,
  formatBRL,
  formatMonthLabel,
  installmentAmount,
  installmentEndDate,
  isInstallmentFinished,
  nextMonth,
  nominalDueDate,
  parseAmountInput,
  remainingInstallments,
  resolveSpecialCategoryLabels,
  sortInstallments,
  todayISO,
  type CreditCard,
  type InstallmentAccounting,
  type InstallmentPlan,
  type TopicConfig,
} from '@/lib/budget';
import { isModuleOn } from '@/lib/modules';
import { walletRepository } from '@/lib/storage';
import { useCards } from '@/components/cards/CardsProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CardPicker } from '@/components/ui/CardPicker';
import { CategoryPicker, type CategoryValue } from '@/components/ui/CategoryPicker';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton } from '@/components/modules/ModuleHelpButton';
import { useBackHref } from '@/components/modules/useBackHref';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { useWallet } from '@/components/wallet/WalletProvider';

export function ParceladosScreen() {
  return (
    <ModuleGate module="installments">
      <Parcelados />
    </ModuleGate>
  );
}

/** "2026-09-04" -> "04/09/26", the compact form the bot's table used. */
function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year.slice(2)}`;
}

function Parcelados() {
  const backHref = useBackHref('installments');
  const { settings } = useSettings();
  const { snapshot, loading, error, month, run } = useWallet();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  useModuleIntro('installments', { ready: !!snapshot });

  if ((loading && !snapshot) || !snapshot) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const today = snapshot.today;
  const sorted = sortInstallments(snapshot.installments, today);
  const active = sorted.filter((plan) => !isInstallmentFinished(plan, today));
  const finished = sorted.filter((plan) => isInstallmentFinished(plan, today));

  async function handleCreate(plan: InstallmentPlan, launchUpfront: boolean) {
    try {
      await run(() =>
        walletRepository.saveInstallment(
          plan,
          launchUpfront ? { month, date: todayISO() } : undefined,
        ),
      );
      setCreating(false);
      showToast('Operação concluída com sucesso!');
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    }
  }

  async function handleDelete(plan: InstallmentPlan) {
    const left = remainingInstallments(plan, today);
    const confirmed = await confirm({
      title: 'Excluir parcelamento',
      message: (
        <>
          Excluir <strong>{plan.name}</strong>? Valor da parcela:{' '}
          {formatBRL(installmentAmount(plan))}. Parcelas restantes: {left}/{plan.count}.
          <br />
          As parcelas que ainda não venceram somem dos meses abertos; as que já foram cobradas
          continuam lançadas.
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
    await run(() => walletRepository.deleteInstallment(plan.id));
    showToast('Parcelamento excluído.');
  }

  function planRow(plan: InstallmentPlan) {
    const left = remainingInstallments(plan, today);
    return (
      <li
        key={plan.id}
        className="border-border bg-card flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm"
      >
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate font-medium">{plan.name}</p>
          <p className="text-muted text-xs">
            {left}/{plan.count} parcelas · 1º déb. {shortDate(plan.firstDebitDate)} · fim{' '}
            {shortDate(installmentEndDate(plan))}
          </p>
          <p className="text-muted text-xs">
            {plan.accounting === 'upfront' ? 'À vista' : 'Parcelada'} ·{' '}
            {formatBRL(plan.totalAmount)} no total
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-foreground font-semibold">{formatBRL(installmentAmount(plan))}</p>
          <button
            type="button"
            onClick={() => void handleDelete(plan)}
            className="text-danger min-h-[36px] text-xs font-medium"
          >
            Excluir
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader
        title="Parcelados"
        subtitle={`Competência: ${formatMonthLabel(month)}`}
        backHref={backHref}
        action={
          <>
            <ModuleHelpButton module="installments" />
            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="Novo parcelamento"
              data-tour="parcelados-novo"
              className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            >
              +
            </button>
          </>
        }
      />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

      <div
        data-tour="parcelados-total"
        className="border-border bg-card mx-4 flex items-center justify-between rounded-xl border p-4 text-sm shadow-sm"
      >
        <span className="text-muted">Ainda a pagar no cartão</span>
        <span className="text-foreground font-semibold">
          {formatBRL(snapshot.cash.report.installmentDebt)}
        </span>
      </div>

      <div data-tour="parcelados-lista" className="flex flex-col">
        <ul className="flex flex-col gap-2 px-4">{active.map(planRow)}</ul>

        {active.length === 0 && (
          <p className="text-muted px-4 py-10 text-center text-sm">
            Nenhum parcelamento em andamento. Cadastre uma compra parcelada e o app lança a parcela
            de cada mês no cartão para você.
          </p>
        )}
      </div>

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

      {creating && settings && (
        <InstallmentFormSheet
          topics={settings.topics}
          specialCategories={settings.specialCategories}
          showReimbursable={isModuleOn(settings, 'reimbursable')}
          month={month}
          onClose={() => setCreating(false)}
          onSave={handleCreate}
        />
      )}
    </div>
  );
}

function InstallmentFormSheet({
  topics,
  specialCategories,
  showReimbursable,
  month,
  onClose,
  onSave,
}: {
  topics: TopicConfig[];
  specialCategories: Parameters<typeof resolveSpecialCategoryLabels>[0];
  showReimbursable: boolean;
  month: string;
  onClose: () => void;
  onSave: (plan: InstallmentPlan, launchUpfront: boolean) => Promise<void>;
}) {
  const labels = resolveSpecialCategoryLabels(specialCategories);
  const activeTopics = topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order);
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [count, setCount] = useState('10');
  const { cards, defaultCard } = useCards();
  const [cardId, setCardId] = useState<string | undefined>(defaultCard?.id ?? undefined);
  // Picking a card fills the first charge with its next due date. The nominal day is what goes
  // in, never the one pushed off a weekend: every later instalment is "first debit + k months",
  // so starting from a postponed day would drag the whole series along.
  const [firstDebitDate, setFirstDebitDate] = useState(
    defaultCard ? nextChargeDate(defaultCard) : todayISO(),
  );
  const [accounting, setAccounting] = useState<InstallmentAccounting>('installment');
  const [launchUpfront, setLaunchUpfront] = useState(false);
  const [category, setCategory] = useState<CategoryValue>({
    categoryKind: 'fixedCost',
    topicId: activeTopics[0]?.id,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const parsedTotal = parseAmountInput(total);
  const parsedCount = Number.parseInt(count, 10);
  const preview =
    parsedTotal > 0 && parsedCount > 0
      ? `${parsedCount}× de ${formatBRL(parsedTotal / parsedCount)}`
      : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problems: string[] = [];
    if (!name.trim()) problems.push('Escreva o nome da compra.');
    if (!(parsedTotal > 0)) problems.push('O valor total deve ser maior que zero.');
    if (!(parsedCount > 0)) problems.push('O número de parcelas deve ser maior que zero.');
    if (category.categoryKind === 'topic' && !category.topicId) problems.push('Selecione uma categoria.');
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setSaving(true);
    try {
      await onSave(
        {
          id: createId(),
          name: name.trim(),
          categoryKind: category.categoryKind,
          ...(category.categoryKind === 'topic' ? { topicId: category.topicId } : {}),
          firstDebitDate,
          count: parsedCount,
          totalAmount: parsedTotal,
          accounting,
          ...(cardId ? { cardId } : {}),
        },
        accounting === 'upfront' && launchUpfront,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open title="Novo parcelamento" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AmountInput value={total} onChange={setTotal} autoFocus />
        {preview && <p className="text-muted -mt-3 text-sm">{preview}</p>}

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Nome da compra
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Faculdade, notebook..."
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <div className="flex gap-3">
          <label className="text-muted flex flex-1 flex-col gap-1.5 text-sm font-medium">
            Parcelas
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
            />
          </label>
          <label className="text-muted flex flex-1 flex-col gap-1.5 text-sm font-medium">
            1º débito
            <input
              type="date"
              value={firstDebitDate}
              onChange={(e) => setFirstDebitDate(e.target.value)}
              className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
            />
          </label>
        </div>

        <CategoryPicker
          topics={topics}
          specialCategories={labels}
          value={category}
          onChange={setCategory}
          showReimbursable={showReimbursable}
        />

        <CardPicker
          cards={cards}
          value={cardId}
          onChange={(id) => {
            setCardId(id);
            const chosen = cards.find((card) => card.id === id);
            if (chosen) setFirstDebitDate(nextChargeDate(chosen));
          }}
        />

        <div>
          <p className="text-muted mb-2 text-sm font-medium">Como contabilizar</p>
          <div className="flex gap-2">
            {(
              [
                ['installment', 'Parcelada'],
                ['upfront', 'À vista'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAccounting(value)}
                className={`min-h-[44px] flex-1 rounded-lg border px-3 text-sm font-medium ${
                  accounting === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-muted mt-2 text-xs">
            {accounting === 'installment'
              ? 'A parcela de cada mês vira um gasto no cartão automaticamente, até acabar.'
              : 'O valor inteiro conta como gasto de uma vez; as parcelas só alimentam a dívida do cartão.'}
          </p>
        </div>

        {accounting === 'upfront' && (
          <label className="text-foreground flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={launchUpfront}
              onChange={(e) => setLaunchUpfront(e.target.checked)}
              className="border-border h-5 w-5 rounded"
            />
            Lançar o total agora em {formatMonthLabel(month)}
          </label>
        )}

        {errors.length > 0 && (
          <ul className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">
            {errors.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </BottomSheet>
  );
}

/**
 * The next charge of a card: its day in the current competence while that has not passed, the
 * next one's afterwards. Always the card's own day, never the one pushed off a weekend — see
 * where the state is set.
 */
function nextChargeDate(card: Pick<CreditCard, 'dueDay' | 'dueMonth'>): string {
  const today = todayISO();
  const month = currentMonthKey();
  const due = nominalDueDate(card, month);
  return due >= today ? due : nominalDueDate(card, nextMonth(month));
}
