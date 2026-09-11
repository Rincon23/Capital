'use client';

import { useEffect, useState } from 'react';
import {
  amountToInputValue,
  computeAvailable,
  computeProportionalFixed,
  createId,
  currentMonthKey,
  formatBRL,
  formatPct,
  parseAmountInput,
  sum,
  validateTopicPercentages,
  validatePositiveAmount,
  type BudgetSettings,
  type TopicConfig,
} from '@/lib/budget';
import { budgetRepository } from '@/lib/storage';
import { getUnforeseenEstimate, setUnforeseenEstimate } from '@/lib/storage/preferences';
import { AmountInput } from '@/components/ui/AmountInput';
import { PercentInput } from '@/components/ui/PercentInput';
import { OnboardingScreen } from './OnboardingScreen';

const TOTAL_STEPS = 5;

interface FixedItemDraft {
  id: string;
  description: string;
  amount: string;
}

interface OnboardingWizardProps {
  settings: BudgetSettings;
  saveSettings: (settings: BudgetSettings) => Promise<void>;
  onSkip: () => void;
  /** Fires once the user confirms step 6 and every write has succeeded. */
  onComplete: () => void;
}

export function OnboardingWizard({ settings, saveSettings, onSkip, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [income, setIncome] = useState('');
  const [registerIncome, setRegisterIncome] = useState(true);
  const [fixedItems, setFixedItems] = useState<FixedItemDraft[]>([
    { id: createId(), description: '', amount: '' },
  ]);
  const [unforeseen, setUnforeseen] = useState(() => {
    const stored = getUnforeseenEstimate();
    return stored ? amountToInputValue(stored) : '';
  });
  const [topics, setTopics] = useState<TopicConfig[]>(() => settings.topics);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort prefill from the current month, so reopening via "Me ajude a configurar"
  // isn't a blank slate. Doesn't block the UI — it's fine if step 1 renders first.
  useEffect(() => {
    let active = true;
    void budgetRepository.peekMonth(currentMonthKey()).then((data) => {
      if (!active) return;
      const incomeTotal = sum(data.incomes.map((i) => i.amount));
      if (incomeTotal > 0) {
        setIncome(amountToInputValue(incomeTotal));
        setRegisterIncome(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const activeTopics = topics.filter((t) => !t.archived);
  const validation = validateTopicPercentages(topics);

  function updateTopicPct(id: string, pct: number) {
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, targetPct: pct } : t)));
  }

  function updateFixedItem(id: string, patch: Partial<FixedItemDraft>) {
    setFixedItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addFixedItem() {
    setFixedItems((prev) => [...prev, { id: createId(), description: '', amount: '' }]);
  }

  function removeFixedItem(id: string) {
    setFixedItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      await saveSettings({ ...settings, topics });

      const month = currentMonthKey();
      const parsedIncome = parseAmountInput(income);
      if (registerIncome && parsedIncome > 0) {
        await budgetRepository.saveIncome(month, {
          id: createId(),
          source: 'Renda mensal',
          amount: parsedIncome,
          date: `${month}-01`,
        });
      }

      const validFixedItems = fixedItems
        .map((item) => ({ ...item, parsedAmount: parseAmountInput(item.amount) }))
        .filter((item) => item.parsedAmount > 0);
      for (const item of validFixedItems) {
        await budgetRepository.saveExpense(month, {
          id: createId(),
          categoryKind: 'fixedCost',
          description: item.description.trim() || settings.specialCategories.fixedCost,
          amount: item.parsedAmount,
          date: `${month}-01`,
        });
      }

      const parsedUnforeseen = parseAmountInput(unforeseen);
      if (parsedUnforeseen > 0) setUnforeseenEstimate(parsedUnforeseen);

      onComplete();
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
      setSaving(false);
    }
  }

  if (step === 1) {
    return (
      <OnboardingScreen step={step} totalSteps={TOTAL_STEPS} onSkip={onSkip} footer={<PrimaryButton onClick={goNext}>Começar</PrimaryButton>}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="text-foreground text-2xl font-bold">Bem-vindo ao Capital</h1>
          <p className="text-muted max-w-sm text-base">
            Aqui o seu dinheiro é organizado em categorias por percentual da sua renda. Nos próximos
            passos você conta quanto ganha, seus custos fixos e uma reserva para imprevistos — e a
            gente te ajuda a montar o resto.
          </p>
        </div>
      </OnboardingScreen>
    );
  }

  if (step === 2) {
    return (
      <OnboardingScreen
        step={step}
        totalSteps={TOTAL_STEPS}
        onSkip={onSkip}
        footer={
          <>
            <BackButton onClick={goBack} />
            <PrimaryButton onClick={goNext} disabled={!validatePositiveAmount(parseAmountInput(income))}>
              Continuar
            </PrimaryButton>
          </>
        }
      >
        <StepHeading title="Quanto você ganha por mês?" subtitle="Pode ser uma média, se sua renda variar. Isso é a base para calcular suas categorias." />
        <AmountInput value={income} onChange={setIncome} autoFocus />
        <label className="text-foreground mt-4 flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={registerIncome}
            onChange={(e) => setRegisterIncome(e.target.checked)}
            className="border-border h-5 w-5 rounded"
          />
          Registrar como minha renda deste mês
        </label>
      </OnboardingScreen>
    );
  }

  if (step === 3) {
    return (
      <OnboardingScreen
        step={step}
        totalSteps={TOTAL_STEPS}
        onSkip={onSkip}
        footer={
          <>
            <BackButton onClick={goBack} />
            <PrimaryButton onClick={goNext}>Continuar</PrimaryButton>
          </>
        }
      >
        <StepHeading
          title="Quais são seus custos fixos?"
          subtitle="Aluguel, contas, assinaturas, faculdade... tudo que você paga todo mês e não dá pra cortar."
        />
        <div className="flex flex-col gap-3">
          {fixedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateFixedItem(item.id, { description: e.target.value })}
                placeholder="Ex.: Aluguel"
                className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] w-0 flex-1 rounded-lg border px-3 text-base outline-none focus:ring-2"
              />
              <input
                type="text"
                inputMode="decimal"
                value={item.amount}
                onChange={(e) => updateFixedItem(item.id, { amount: e.target.value })}
                placeholder="R$ 0,00"
                className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] w-28 shrink-0 rounded-lg border px-3 text-right text-base outline-none focus:ring-2"
              />
              <button
                type="button"
                onClick={() => removeFixedItem(item.id)}
                disabled={fixedItems.length === 1}
                aria-label="Remover"
                className="text-muted min-h-[44px] min-w-[44px] shrink-0 disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addFixedItem}
            className="border-border text-muted hover:text-foreground min-h-[44px] rounded-lg border border-dashed text-sm font-medium"
          >
            + Adicionar custo fixo
          </button>
          <p className="text-muted text-xs">
            Isso lança novos custos fixos no mês atual — os que você já tem continuam do jeito que
            estão.
          </p>
        </div>
      </OnboardingScreen>
    );
  }

  if (step === 4) {
    return (
      <OnboardingScreen
        step={step}
        totalSteps={TOTAL_STEPS}
        onSkip={onSkip}
        footer={
          <>
            <BackButton onClick={goBack} />
            <PrimaryButton onClick={goNext}>Continuar</PrimaryButton>
          </>
        }
      >
        <StepHeading
          title="E os imprevistos?"
          subtitle="Pense: quanto mais ou menos você gasta por mês com coisas imprevistas que não dá pra evitar? Tipo quebrar o celular, óculos, uma consulta médica de última hora..."
        />
        <AmountInput value={unforeseen} onChange={setUnforeseen} autoFocus />
        <p className="text-muted mt-3 text-sm">
          Não é um valor fixo nem vira um lançamento sozinho — é só uma referência pra você não se
          assustar quando um imprevisto acontecer de verdade.
        </p>
      </OnboardingScreen>
    );
  }

  const incomeTotal = parseAmountInput(income);
  const fixedTotal = sum(fixedItems.map((item) => parseAmountInput(item.amount)));
  const unforeseenTotal = parseAmountInput(unforeseen);
  const preview = activeTopics.map((topic) => {
    const proportionalFixed = computeProportionalFixed(fixedTotal, unforeseenTotal, topic.targetPct);
    const available = computeAvailable(incomeTotal, topic.targetPct, proportionalFixed, 0);
    return { ...topic, available };
  });

  return (
    <OnboardingScreen
      step={step}
      totalSteps={TOTAL_STEPS}
      onSkip={onSkip}
      footer={
        <>
          <BackButton onClick={goBack} disabled={saving} />
          <PrimaryButton onClick={handleFinish} disabled={saving || !validation.valid}>
            {saving ? 'Salvando…' : 'Concluir configuração'}
          </PrimaryButton>
        </>
      }
    >
      <StepHeading
        title="Suas categorias"
        subtitle="Custos fixos e imprevistos já saem proporcionalmente de cada categoria. Ajuste os percentuais — juntos, eles têm que fechar 100% — e veja na hora quanto sobra pra gastar em cada uma."
      />
      <div className="border-border bg-card mb-4 flex flex-col gap-1 rounded-xl border p-4 text-sm">
        <Row label="Renda mensal" value={formatBRL(incomeTotal)} />
        <Row label="Custos fixos" value={formatBRL(fixedTotal)} />
        <Row label="Reserva para imprevistos (referência)" value={formatBRL(unforeseenTotal)} />
      </div>
      <div className="flex flex-col gap-2">
        {preview.map((topic) => (
          <div key={topic.id} className="border-border flex items-center gap-3 rounded-lg border p-3 text-sm">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: topic.color }} />
            <span className="text-foreground min-w-0 flex-1 truncate font-medium">{topic.name}</span>
            <div className="flex shrink-0 items-center gap-1">
              <PercentInput
                value={topic.targetPct}
                onChange={(pct) => updateTopicPct(topic.id, pct)}
                ariaLabel={`Percentual de ${topic.name}`}
              />
              <span className="text-muted">%</span>
            </div>
            <span className="text-foreground shrink-0 min-w-[92px] text-right font-semibold">
              {formatBRL(topic.available)}
            </span>
          </div>
        ))}
      </div>
      <p className={`mt-3 text-sm ${validation.valid ? 'text-success' : 'text-danger'}`}>
        {validation.valid
          ? 'Soma das categorias: 100%.'
          : validation.diffPct > 0
            ? `Faltam ${formatPct(validation.diffPct)} para completar 100%.`
            : `Excesso de ${formatPct(-validation.diffPct)} além de 100%.`}
      </p>
      {error && <p className="bg-danger-bg text-danger mt-4 rounded-lg px-3 py-2 text-sm">{error}</p>}
    </OnboardingScreen>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-foreground text-xl font-bold">{title}</h1>
      <p className="text-muted mt-1.5 text-sm">{subtitle}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-primary text-primary-foreground min-h-[44px] flex-1 rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border-border text-foreground min-h-[44px] shrink-0 rounded-lg border px-4 py-2 font-medium disabled:opacity-50"
    >
      Voltar
    </button>
  );
}
