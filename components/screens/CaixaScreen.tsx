'use client';

import { useState } from 'react';
import {
  amountToInputValue,
  formatBRL,
  formatMonthLabel,
  formatMonthShort,
  openBills,
  parseAmountInput,
  type CashSettings,
} from '@/lib/budget';
import { isModuleOn } from '@/lib/modules';
import { walletRepository } from '@/lib/storage';
import { useSettings } from '@/components/providers/SettingsProvider';
import { PageHeader } from '@/components/layout/PageHeader';
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
  useModuleIntro('cash', { ready: !!snapshot });

  if ((loading && !snapshot) || !snapshot) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const { report } = snapshot.cash;
  const { buckets } = snapshot.investments;
  // With the Cartões module on, the debt is every bill still waiting for "Fatura paga" — which
  // can be more than one competence. Without it, it is simply the bill of the open month.
  const open = isModuleOn(settings, 'cards') ? openBills(snapshot.bills) : null;
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
    </div>
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
