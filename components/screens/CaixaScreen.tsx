'use client';

import { useState } from 'react';
import {
  RESERVE_CONTRIBUTION_NOTE,
  RESERVE_PLAN_EXPLANATION,
  amountToInputValue,
  currentMonthKey,
  formatBRL,
  formatMonthLabel,
  formatMonthShort,
  openBills,
  parseAmountInput,
  reservePlanProblem,
  resolveSpecialCategoryLabels,
  todayISO,
  type CashSettings,
  type ReservePlan,
  type ReservePlanSummary,
} from '@/lib/budget';
import { isModuleOn } from '@/lib/modules';
import { walletRepository } from '@/lib/storage';
import { useSettings } from '@/components/providers/SettingsProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CategoryPicker, type CategoryValue } from '@/components/ui/CategoryPicker';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useToast } from '@/components/ui/Toast';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton, ModuleSettingsButton } from '@/components/modules/ModuleHelpButton';
import { ModuleSettingsSheet } from '@/components/modules/ModuleSettingsSheet';
import { useBackHref } from '@/components/modules/useBackHref';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { useWallet } from '@/components/wallet/WalletProvider';

export function CaixaScreen() {
  return (
    <ModuleGate module="cash">
      <Caixa />
    </ModuleGate>
  );
}

function Row({
  label,
  value,
  hint,
  strong,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  strong?: boolean;
  tone?: 'danger' | 'success';
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="text-muted min-w-0">
        {label}
        {hint && <span className="text-muted block text-xs">{hint}</span>}
      </span>
      <span
        className={`shrink-0 ${strong ? 'text-base font-semibold' : 'font-medium'} ${
          tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-foreground'
        }`}
      >
        {formatBRL(value)}
      </span>
    </div>
  );
}

function Caixa() {
  const backHref = useBackHref('cash');
  const { snapshot, loading, error } = useWallet();
  const { settings } = useSettings();
  const [configuring, setConfiguring] = useState(false);
  /** O formulário do plano, criando ou ajustando. */
  const [planning, setPlanning] = useState(false);
  /** O lançamento de uma parcela do plano. */
  const [contributing, setContributing] = useState(false);
  useModuleIntro('cash', { ready: !!snapshot });

  if ((loading && !snapshot) || !snapshot) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const { report } = snapshot.cash;
  const { buckets } = snapshot.investments;
  // The debt is every bill still waiting for "Fatura paga" — which can be more than one
  // competence, and includes the "Não informado" one, since no bill leaves on its own.
  const open = isModuleOn(settings, 'card') ? openBills(snapshot.bills) : null;
  const cardDebtHint = open
    ? open.length === 0
      ? 'Todas as faturas pagas'
      : `Faturas em aberto: ${open.map((bill) => `${bill.cardName} (${formatMonthShort(bill.month)})`).join(', ')}`
    : `Fatura de ${formatMonthLabel(report.cardMonth)}`;

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader
        title="Reserva de emergência"
        backHref={backHref}
        action={
          <>
            <ModuleHelpButton module="cash" />
            <ModuleSettingsButton module="cash" tourAnchor="caixa-config" onClick={() => setConfiguring(true)} />
          </>
        }
      />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

      <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <div data-tour="caixa-reserva" className="flex flex-col gap-3">
          <Row label="Reserva em conta" value={report.reserveAccount} />
          <Row
            label="Reserva investida"
            value={report.investedReserve}
            hint="Só a parte livre, fora das categorias da reserva"
          />
          <Row label="Valor total de reserva" value={report.totalReserve} strong />
        </div>

        <hr className="border-border" />

        <div data-tour="caixa-dividas" className="flex flex-col gap-3">
        <Row
          label="Dívida do cartão"
          value={report.cardDebt}
          hint={cardDebtHint}
          tone={report.cardDebt < 0 ? 'danger' : undefined}
        />
        <Row
          label="Dívida dos parcelados"
          value={report.installmentDebt}
          hint="Parcelas que ainda vão ser cobradas"
          tone={report.installmentDebt < 0 ? 'danger' : undefined}
        />
        <Row label="Dívida total" value={report.totalDebt} strong tone={report.totalDebt < 0 ? 'danger' : undefined} />
        </div>

        <hr className="border-border" />

        <div data-tour="caixa-gap" className="flex flex-col gap-3">
        <Row
          label="Reserva prevista"
          value={report.expectedReserve}
          hint={`${report.multiplier}× o custo mensal de ${formatBRL(report.monthlyCost)}`}
        />
        <Row
          label="Gap da reserva"
          value={report.gap}
          hint={report.gap >= 0 ? 'Você já tem o que precisa' : 'Quanto falta juntar'}
          strong
          tone={report.gap >= 0 ? 'success' : 'danger'}
        />
        </div>
      </section>

      <ReservePlanSection
        plan={snapshot.cash.plan}
        gap={report.gap}
        onCreate={() => setPlanning(true)}
        onEdit={() => setPlanning(true)}
        onContribute={() => setContributing(true)}
      />

      {buckets.length > 0 && (
        <section className="flex flex-col gap-2 px-4">
          <h2 className="text-muted text-sm font-semibold">Categorias da reserva (fora do total)</h2>
          <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
            {buckets.map((bucket) => (
              <Row key={bucket.id} label={bucket.name} value={bucket.value} />
            ))}
            <p className="text-muted text-xs">
              Essas cotas já estão reservadas para uma categoria, então não contam como reserva de
              emergência.
            </p>
          </div>
        </section>
      )}

      {configuring && (
        <ModuleSettingsSheet module="cash" onClose={() => setConfiguring(false)}>
          <CashSettingsForm settings={snapshot.cash.settings} />
        </ModuleSettingsSheet>
      )}

      {planning && (
        <ReservePlanSheet
          plan={snapshot.cash.plan}
          gap={report.gap}
          onClose={() => setPlanning(false)}
        />
      )}

      {contributing && snapshot.cash.plan && (
        <ReserveContributionSheet plan={snapshot.cash.plan} onClose={() => setContributing(false)} />
      )}
    </div>
  );
}

/**
 * O plano de recompor a reserva. Só aparece com voz de comando quando o gap está negativo — é aí
 * que ele serve para alguma coisa —, mas quem quiser montar a reserva do zero também acha o botão.
 */
function ReservePlanSection({
  plan,
  gap,
  onCreate,
  onEdit,
  onContribute,
}: {
  plan: ReservePlanSummary | null;
  gap: number;
  onCreate: () => void;
  onEdit: () => void;
  onContribute: () => void;
}) {
  if (!plan) {
    return (
      <section className="px-4">
        {gap < 0 ? (
          <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
            <div>
              <p className="text-foreground font-semibold">
                Faltam {formatBRL(Math.abs(gap))} para a sua reserva
              </p>
              <p className="text-muted mt-1 text-sm">{RESERVE_PLAN_EXPLANATION}</p>
            </div>
            <button
              type="button"
              onClick={onCreate}
              className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 text-sm font-semibold"
            >
              Montar um plano
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onCreate}
            className="text-muted hover:text-foreground min-h-[44px] w-full text-sm font-medium underline underline-offset-2"
          >
            Montar um plano para a reserva
          </button>
        )}
      </section>
    );
  }

  const missingThisMonth = Math.max(0, plan.monthly - plan.contributedThisMonth);

  return (
    <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground font-semibold">Plano da reserva</p>
          {plan.plan.reason && <p className="text-muted truncate text-xs">{plan.plan.reason}</p>}
        </div>
        <button type="button" onClick={onEdit} className="text-primary shrink-0 text-sm font-medium">
          Editar
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted">
            {formatBRL(plan.contributed)} de {formatBRL(plan.plan.targetAmount)}
          </span>
          <span className="text-foreground font-semibold">
            {Math.round(plan.progress * 100)}%
          </span>
        </div>
        <ProgressBar usedPct={plan.progress} state={plan.done ? 'ok' : 'warning'} />
      </div>

      {plan.done ? (
        <p className="bg-success-bg text-success rounded-lg px-3 py-2 text-sm font-medium">
          Plano cumprido: a reserva já recebeu tudo o que tinha de receber.
        </p>
      ) : (
        <>
          <p className="text-muted text-sm">
            {formatBRL(plan.monthly)} por mês · faltam {plan.monthsLeft}{' '}
            {plan.monthsLeft === 1 ? 'mês' : 'meses'} ({formatBRL(plan.remaining)})
          </p>
          <button
            type="button"
            onClick={onContribute}
            className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 text-sm font-semibold"
          >
            {plan.contributedThisMonth === 0
              ? 'Lançar a parcela deste mês'
              : missingThisMonth > 0
                ? `Lançar mais (faltam ${formatBRL(missingThisMonth)} neste mês)`
                : 'A parcela deste mês já foi — lançar mais'}
          </button>
        </>
      )}
    </section>
  );
}

/** Quanto recompor e em quantos meses. O resto do plano é calculado a partir do que for lançado. */
function ReservePlanSheet({
  plan,
  gap,
  onClose,
}: {
  plan: ReservePlanSummary | null;
  gap: number;
  onClose: () => void;
}) {
  const { run } = useWallet();
  const { showToast } = useToast();
  const confirm = useConfirm();
  // Sem plano, o buraco da reserva é o palpite óbvio: é exatamente o que falta. Com a reserva já
  // completa não há palpite nenhum, e o campo fica vazio em vez de sugerir zero.
  const [target, setTarget] = useState(() => {
    if (plan) return amountToInputValue(plan.plan.targetAmount);
    return gap < 0 ? amountToInputValue(-gap) : '';
  });
  const [months, setMonths] = useState(String(plan?.plan.months ?? 6));
  const [reason, setReason] = useState(plan?.plan.reason ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsedTarget = parseAmountInput(target);
  const parsedMonths = Number.parseInt(months, 10);
  const draft: ReservePlan = {
    targetAmount: parsedTarget,
    months: parsedMonths,
    startMonth: plan?.plan.startMonth ?? currentMonthKey(),
    ...(reason.trim() ? { reason: reason.trim() } : {}),
  };
  const problem = reservePlanProblem(draft);
  const monthly = problem ? 0 : parsedTarget / parsedMonths;

  async function handleDelete() {
    const confirmed = await confirm({
      title: 'Desistir do plano',
      message:
        'O plano sai da tela. As parcelas que você já lançou continuam nos meses — o dinheiro voltou mesmo para a reserva.',
      confirmLabel: 'Desistir',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await run(() => walletRepository.deleteReservePlan());
      showToast('Plano encerrado.');
      onClose();
    } catch {
      setError('Não foi possível encerrar o plano. Tente novamente em alguns instantes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open title={plan ? 'Editar o plano' : 'Montar um plano'} onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (problem) {
            setError(problem);
            return;
          }
          setError(null);
          setSaving(true);
          try {
            await run(() => walletRepository.saveReservePlan(draft));
            showToast(plan ? 'Plano atualizado.' : 'Plano criado.');
            onClose();
          } catch {
            setError('Não foi possível salvar. Tente novamente em alguns instantes.');
          } finally {
            setSaving(false);
          }
        }}
      >
        {!plan && <p className="text-muted text-sm">{RESERVE_PLAN_EXPLANATION}</p>}

        <AmountInput value={target} onChange={setTarget} label="Quanto recompor" autoFocus={!plan} />

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Em quantos meses
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            value={months}
            onChange={(event) => setMonths(event.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] w-28 rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          O que abriu o buraco (opcional)
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: Cirurgia, conserto do carro..."
            maxLength={200}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        {!problem && (
          <p className="bg-background text-foreground rounded-lg px-3 py-2 text-sm">
            {formatBRL(parsedTarget)} em {parsedMonths} {parsedMonths === 1 ? 'mês' : 'meses'} ={' '}
            <strong>{formatBRL(monthly)} por mês</strong>.
          </p>
        )}

        {error && <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">{error}</p>}

        <div className="flex gap-3 pt-1">
          {plan && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={saving}
              className="border-danger text-danger min-h-[44px] rounded-lg border px-4 py-2 font-semibold disabled:opacity-50"
            >
              Desistir
            </button>
          )}
          <button
            type="submit"
            disabled={saving || !!problem}
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
 * Uma parcela do plano: o gasto do mês, que é o que o plano acompanha. Não pergunta onde o
 * dinheiro vai ficar — na conta ou em cotas — porque isso não muda nada aqui e continua sendo a
 * pessoa quem diz, na reserva em conta e nas cotas.
 */
function ReserveContributionSheet({
  plan,
  onClose,
}: {
  plan: ReservePlanSummary;
  onClose: () => void;
}) {
  const { run, month } = useWallet();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const suggested = Math.max(0, Math.min(plan.monthly - plan.contributedThisMonth, plan.remaining));
  const [amount, setAmount] = useState(amountToInputValue(suggested || plan.remaining));
  const [category, setCategory] = useState<CategoryValue>({ categoryKind: 'unforeseen' });
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const labels = resolveSpecialCategoryLabels(settings?.specialCategories);
  const parsed = parseAmountInput(amount);

  return (
    <BottomSheet open title="Lançar no plano" onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!(parsed > 0)) return;
          setError(null);
          setSaving(true);
          try {
            await run(() =>
              walletRepository.contributeToReserve({
                amount: parsed,
                month,
                date,
                categoryKind: category.categoryKind,
                ...(category.categoryKind === 'topic' && category.topicId
                  ? { topicId: category.topicId }
                  : {}),
              }),
            );
            showToast('Parcela lançada.');
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Não foi possível lançar. Tente novamente.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <AmountInput value={amount} onChange={setAmount} autoFocus />

        <CategoryPicker
          topics={settings?.topics ?? []}
          specialCategories={labels}
          value={category}
          onChange={setCategory}
          showUncounted={false}
          recommended="unforeseen"
        />
        <p className="text-muted -mt-3 text-xs">
          Recompor a reserva é um imprevisto, não um investimento: o dinheiro está fechando um
          buraco, não rendendo a longo prazo. Se para você faz mais sentido em outra categoria,
          troque aqui.
        </p>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Data
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <p className="text-muted text-sm">
          Entra como &ldquo;Recompor a reserva&rdquo; na competência de {formatMonthLabel(month)}. Depois
          desta parcela, faltam {formatBRL(Math.max(0, plan.remaining - parsed))} do plano.{' '}
          {RESERVE_CONTRIBUTION_NOTE}
        </p>

        {error && <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving || !(parsed > 0)}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Confirmar'}
        </button>
      </form>
    </BottomSheet>
  );
}

/** A cost line while it is being edited: the amount stays as typed until it is saved. */
interface CostDraft {
  label: string;
  amount: string;
}

/** Reserve in the bank, the "no income" monthly costs and how many months to cover. */
function CashSettingsForm({ settings }: { settings: CashSettings }) {
  const { run } = useWallet();
  const { showToast } = useToast();
  const [reserve, setReserve] = useState(amountToInputValue(settings.reserveAccountAmount));
  const [costs, setCosts] = useState<CostDraft[]>(() =>
    settings.emergencyCosts.map((cost) => ({
      label: cost.label,
      amount: amountToInputValue(cost.amount),
    })),
  );
  const [multiplier, setMultiplier] = useState(String(settings.reserveMultiplier));
  const [busy, setBusy] = useState(false);

  function updateCost(index: number, patch: Partial<CostDraft>) {
    setCosts((prev) => prev.map((cost, i) => (i === index ? { ...cost, ...patch } : cost)));
  }

  async function handleSave() {
    setBusy(true);
    try {
      await run(() =>
        walletRepository.saveCashSettings({
          reserveAccountAmount: parseAmountInput(reserve),
          emergencyCosts: costs
            .map((cost) => ({ label: cost.label.trim(), amount: parseAmountInput(cost.amount) }))
            .filter((cost) => cost.label || cost.amount > 0),
          reserveMultiplier: Math.max(1, Number.parseInt(multiplier, 10) || 6),
        }),
      );
      showToast('Configurações salvas.');
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 px-4">
      <h2 className="text-muted text-sm font-semibold">Reserva e custos mensais</h2>
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-sm">
        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Reserva em conta (R$)
          <input
            type="text"
            inputMode="decimal"
            value={reserve}
            onChange={(e) => setReserve(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-muted text-sm font-medium">Custo mensal se eu ficar sem renda</p>
          {costs.map((cost, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={cost.label}
                onChange={(e) => updateCost(index, { label: e.target.value })}
                placeholder="Ex.: Contas"
                aria-label={`Descrição do custo ${index + 1}`}
                className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] w-0 min-w-0 flex-1 rounded-md border px-3 outline-none focus:ring-2"
              />
              <input
                type="text"
                inputMode="decimal"
                value={cost.amount}
                onChange={(e) => updateCost(index, { amount: e.target.value })}
                placeholder="0,00"
                aria-label={`Valor do custo ${index + 1}`}
                className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] w-24 shrink-0 rounded-md border px-3 text-right outline-none focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setCosts((prev) => prev.filter((_, i) => i !== index))}
                aria-label={`Remover custo ${index + 1}`}
                className="border-danger text-danger min-h-[44px] w-11 shrink-0 rounded-md border"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCosts((prev) => [...prev, { label: '', amount: '' }])}
            className="border-border text-muted hover:text-foreground min-h-[44px] rounded-lg border border-dashed text-sm font-medium"
          >
            + Adicionar custo
          </button>
        </div>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Meses de reserva
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </section>
  );
}
