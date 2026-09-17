'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  DEFAULT_TOPIC_COLORS,
  FIXED_COST_TIP,
  KEEP_DEFAULT_TOPICS_ADVICE,
  activeTopics as activeTopicsOf,
  amountToInputValue,
  computeAvailable,
  computeProportionalFixed,
  createId,
  currentMonthKey,
  formatBRL,
  formatPct,
  normalizeTopic,
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
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { PercentInput } from '@/components/ui/PercentInput';
import { OnboardingScreen } from './OnboardingScreen';

const TOTAL_STEPS = 6;

interface OnboardingWizardProps {
  settings: BudgetSettings;
  saveSettings: (settings: BudgetSettings) => Promise<void>;
  /** The first screen's text: why the questions are being asked now. */
  intro: { title: string; text: string; start?: string };
  onSkip: () => void;
  /** Fires once the user confirms the last step and every write has succeeded. */
  onComplete: () => void;
}

/**
 * The questions that set up the categories (Categorias, on the first visit and from "Me ajude com
 * as %"): income, fixed costs, unforeseen costs, what each category is for and the percentages,
 * with a live preview of what each category gets. A category can be created here too, though the
 * app advises against it; none can be deleted (see CategoriesSettings).
 */
export function OnboardingWizard({ settings, saveSettings, intro, onSkip, onComplete }: OnboardingWizardProps) {
  const confirm = useConfirm();
  const [step, setStep] = useState(1);
  const [income, setIncome] = useState('');
  const [registerIncome, setRegisterIncome] = useState(true);
  const [fixedCosts, setFixedCosts] = useState('');
  const [unforeseen, setUnforeseen] = useState(() => {
    const stored = getUnforeseenEstimate();
    return stored ? amountToInputValue(stored) : '';
  });
  const [topics, setTopics] = useState<TopicConfig[]>(() => settings.topics.map(normalizeTopic));
  const [adviceAccepted, setAdviceAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort prefill from the current month, so reopening via "Me ajude com as %"
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
      const fixedTotal = sum(
        data.expenses.filter((e) => e.categoryKind === 'fixedCost').map((e) => e.amount),
      );
      if (fixedTotal > 0) setFixedCosts(amountToInputValue(fixedTotal));
    });
    return () => {
      active = false;
    };
  }, []);

  const activeTopics = activeTopicsOf(topics);
  const validation = validateTopicPercentages(topics);
  const savedIds = new Set(settings.topics.map((t) => t.id));
  const namesFilled = activeTopics.every((t) => t.name.trim().length > 0);

  function updateTopic(id: string, patch: Partial<TopicConfig>) {
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  /** Creating a category is possible, but the app first says why it is rarely a good idea. */
  async function addTopic() {
    if (!adviceAccepted) {
      const confirmed = await confirm({
        title: 'Criar uma categoria nova?',
        message: (
          <>
            <span className="block">{KEEP_DEFAULT_TOPICS_ADVICE}</span>
            <span className="mt-2 block">Se criar, ela não poderá ser excluída depois, só arquivada.</span>
          </>
        ),
        confirmLabel: 'Criar mesmo assim',
        cancelLabel: 'Manter como está',
      });
      if (!confirmed) return;
      setAdviceAccepted(true);
    }
    setTopics((prev) => [
      ...prev,
      {
        id: createId(),
        name: '',
        description: '',
        targetPct: 0,
        order: Math.max(-1, ...prev.map((t) => t.order)) + 1,
        color: DEFAULT_TOPIC_COLORS[prev.length % DEFAULT_TOPIC_COLORS.length],
      },
    ]);
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
      await saveSettings({
        ...settings,
        topics: topics.map((t) => ({ ...t, name: t.name.trim(), description: t.description?.trim() })),
      });

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
      <OnboardingScreen
        step={step}
        totalSteps={TOTAL_STEPS}
        onSkip={onSkip}
        footer={<PrimaryButton onClick={goNext}>{intro.start ?? 'Começar'}</PrimaryButton>}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="text-foreground text-2xl font-bold">{intro.title}</h1>
          <p className="text-muted max-w-sm text-base">{intro.text}</p>
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
          subtitle="Pense agora qual é o valor dos seus custos fixos: aluguel, contas, assinaturas, faculdade... tudo que você paga todo mês e não dá pra cortar."
        />
        <AmountInput value={fixedCosts} onChange={setFixedCosts} autoFocus />
        <p className="text-muted mt-3 text-sm">
          Não vira um lançamento sozinho — é só para calcular a prévia das suas categorias no
          próximo passo. Para registrar um custo fixo de verdade, use “Lançar gasto” depois.
        </p>
        <p className="border-border text-muted mt-3 rounded-lg border px-3 py-2 text-sm">{FIXED_COST_TIP}</p>
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

  if (step === 5) {
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
          title="Para que serve cada categoria"
          subtitle="Cada categoria recebe uma % da sua renda. Use cada uma assim:"
        />
        <ul className="flex flex-col gap-2">
          {activeTopics.map((topic) => (
            <li key={topic.id} className="border-border bg-card flex gap-3 rounded-xl border p-3">
              <span
                aria-hidden
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: topic.color }}
              />
              <span className="min-w-0">
                <span className="text-foreground block font-semibold">{topic.name}</span>
                {topic.description && <span className="text-muted block text-sm">{topic.description}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-border text-muted mt-4 rounded-lg border px-3 py-2 text-sm">{FIXED_COST_TIP}</p>
      </OnboardingScreen>
    );
  }

  const incomeTotal = parseAmountInput(income);
  const fixedTotal = parseAmountInput(fixedCosts);
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
          <PrimaryButton onClick={handleFinish} disabled={saving || !validation.valid || !namesFilled}>
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
        {preview.map((topic) =>
          savedIds.has(topic.id) ? (
            <div key={topic.id} className="border-border flex items-center gap-3 rounded-lg border p-3 text-sm">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: topic.color }} />
              <span className="text-foreground min-w-0 flex-1 truncate font-medium">{topic.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <PercentInput
                  value={topic.targetPct}
                  onChange={(pct) => updateTopic(topic.id, { targetPct: pct })}
                  ariaLabel={`Percentual de ${topic.name}`}
                />
                <span className="text-muted">%</span>
              </div>
              <span className="text-foreground shrink-0 min-w-[92px] text-right font-semibold">
                {formatBRL(topic.available)}
              </span>
            </div>
          ) : (
            <NewTopicRow
              key={topic.id}
              topic={topic}
              available={topic.available}
              onChange={(patch) => updateTopic(topic.id, patch)}
              onDiscard={() => setTopics((prev) => prev.filter((t) => t.id !== topic.id))}
            />
          ),
        )}
        <button
          type="button"
          onClick={() => void addTopic()}
          className="border-border text-muted hover:text-foreground min-h-[44px] rounded-lg border border-dashed text-sm font-medium"
        >
          + Adicionar categoria
        </button>
      </div>
      <p className="bg-primary/10 text-foreground mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed">
        {KEEP_DEFAULT_TOPICS_ADVICE}
      </p>
      <p className={`mt-3 text-sm ${validation.valid ? 'text-success' : 'text-danger'}`}>
        {validation.valid
          ? 'Soma das categorias: 100%.'
          : validation.diffPct > 0
            ? `Faltam ${formatPct(validation.diffPct)} para completar 100%.`
            : `Excesso de ${formatPct(-validation.diffPct)} além de 100%.`}
      </p>
      {!namesFilled && <p className="text-danger mt-1 text-sm">Dê um nome para a categoria nova.</p>}
      {error && <p className="bg-danger-bg text-danger mt-4 rounded-lg px-3 py-2 text-sm">{error}</p>}
    </OnboardingScreen>
  );
}

/** A category created in this wizard: name, what it is for and its percentage. */
function NewTopicRow({
  topic,
  available,
  onChange,
  onDiscard,
}: {
  topic: TopicConfig;
  available: number;
  onChange: (patch: Partial<TopicConfig>) => void;
  onDiscard: () => void;
}) {
  return (
    <div className="border-primary/40 flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: topic.color }} />
        <input
          type="text"
          value={topic.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nome da categoria"
          maxLength={40}
          aria-label="Nome da nova categoria"
          className="border-border bg-background text-foreground focus:ring-primary min-h-[40px] w-0 min-w-0 flex-1 rounded-md border px-2 outline-none focus:ring-2"
        />
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Desistir desta categoria"
          className="text-muted hover:text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      </div>
      <textarea
        value={topic.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={2}
        maxLength={300}
        placeholder="Para que serve esta categoria?"
        aria-label="Descrição da nova categoria"
        className="border-border bg-background text-foreground focus:ring-primary w-full rounded-md border px-2 py-1.5 outline-none focus:ring-2"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <PercentInput
            value={topic.targetPct}
            onChange={(pct) => onChange({ targetPct: pct })}
            ariaLabel="Percentual da nova categoria"
          />
          <span className="text-muted">%</span>
        </div>
        <span className="text-foreground font-semibold">{formatBRL(available)}</span>
      </div>
    </div>
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
