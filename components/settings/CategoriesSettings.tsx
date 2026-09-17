'use client';

import { useState } from 'react';
import {
  BUDGET_EXPLANATIONS,
  DEFAULT_TOPIC_COLORS,
  KEEP_DEFAULT_TOPICS_ADVICE,
  REIMBURSABLE_EXPLANATION,
  activeTopics,
  createId,
  formatPct,
  hasDefaultTopics,
  normalizeTopic,
  resolveSpecialCategoryColors,
  resolveSpecialCategoryLabels,
  resolveTopicColor,
  restoreDefaultTopics,
  validateTopicPercentages,
  type BudgetSettings,
  type ResolvedSpecialCategoryLabels,
  type SpecialCategoryColors,
  type TopicConfig,
} from '@/lib/budget';
import { resolveModules } from '@/lib/modules';
import { useSettings } from '@/components/providers/SettingsProvider';
import { PercentInput } from '@/components/ui/PercentInput';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';

const SPECIAL_CATEGORY_FIELDS: {
  key: keyof ResolvedSpecialCategoryLabels;
  label: string;
  explanation: string;
}[] = [
  { key: 'fixedCost', label: 'Custo fixo', explanation: BUDGET_EXPLANATIONS.fixedCost },
  { key: 'unforeseen', label: 'Imprevistos', explanation: BUDGET_EXPLANATIONS.unforeseen },
];

/**
 * The categories expenses are filed under: name, description, colour and order, plus the special
 * categories. With `withTargets` (the Categorias screen, "Gastos por categoria" on) each one also
 * gets its target percentage, and saving requires them to add up to 100%.
 *
 * A category is never deleted, only archived, and archived ones are not listed. "Restaurar
 * categorias padrão" brings back the four defaults and takes every other category out of the list.
 */
export function CategoriesSettings({ withTargets, onSaved }: { withTargets: boolean; onSaved?: () => void }) {
  const { settings, saveSettings } = useSettings();
  if (!settings) return null;
  return (
    <CategoriesForm
      settings={settings}
      saveSettings={saveSettings}
      withTargets={withTargets}
      onSaved={onSaved}
    />
  );
}

function CategoriesForm({
  settings,
  saveSettings,
  withTargets,
  onSaved,
}: {
  settings: BudgetSettings;
  saveSettings: (settings: BudgetSettings) => Promise<void>;
  withTargets: boolean;
  onSaved?: () => void;
}) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  // A draft, seeded once: nothing changes until "Salvar".
  const [topics, setTopics] = useState<TopicConfig[]>(() => settings.topics.map(normalizeTopic));
  const [special, setSpecial] = useState<ResolvedSpecialCategoryLabels>(() =>
    resolveSpecialCategoryLabels(settings),
  );
  const [specialColors, setSpecialColors] = useState<SpecialCategoryColors>(() =>
    resolveSpecialCategoryColors(settings),
  );
  const [adviceAccepted, setAdviceAccepted] = useState(false);
  /** "Restaurar" tapped with nothing to restore; said here, since a toast sits behind the sheet. */
  const [alreadyDefault, setAlreadyDefault] = useState(false);
  /** A failed save, shown in the sheet (a toast would sit behind it). */
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const modules = resolveModules(settings);
  const validation = validateTopicPercentages(topics);
  const shown = activeTopics(topics);
  const savedIds = new Set(settings.topics.map((t) => t.id));
  const namesFilled = shown.every((t) => t.name.trim().length > 0);
  const canSave = namesFilled && (!withTargets || validation.valid);
  // The "A receber" label and colour only make sense while its module is on.
  const specialFields = modules.reimbursable
    ? [
        ...SPECIAL_CATEGORY_FIELDS,
        { key: 'reimbursable' as const, label: 'A receber', explanation: REIMBURSABLE_EXPLANATION },
      ]
    : SPECIAL_CATEGORY_FIELDS;

  function updateTopic(id: string, patch: Partial<TopicConfig>) {
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  /** Swaps places with the neighbour among the categories shown (archived ones keep theirs). */
  function moveTopic(id: string, direction: -1 | 1) {
    const index = shown.findIndex((t) => t.id === id);
    const other = shown[index + direction];
    if (!other) return;
    const current = shown[index];
    setTopics((prev) =>
      prev.map((t) => {
        if (t.id === current.id) return { ...t, order: other.order };
        if (t.id === other.id) return { ...t, order: current.order };
        return t;
      }),
    );
  }

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

  async function archiveTopic(topic: TopicConfig) {
    // A category created in this draft was never saved: giving up on it just drops it.
    if (!savedIds.has(topic.id)) {
      setTopics((prev) => prev.filter((t) => t.id !== topic.id));
      return;
    }
    const confirmed = await confirm({
      title: 'Arquivar categoria',
      message: `"${topic.name}" sai das suas categorias a partir deste mês e não aparece mais. Nada é apagado: os meses anteriores continuam exatamente como estão. A mudança vale quando você salvar.`,
      confirmLabel: 'Arquivar',
      cancelLabel: 'Manter',
    });
    if (confirmed) updateTopic(topic.id, { archived: true });
  }

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await saveSettings({
        ...settings,
        topics: topics.map((t) => ({ ...t, name: t.name.trim(), description: t.description?.trim() })),
        specialCategories: special,
        specialCategoryColors: specialColors,
      });
      showToast('Categorias salvas.');
      onSaved?.();
    } catch {
      setError('Não foi possível salvar. Tente novamente em alguns instantes.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (hasDefaultTopics(settings.topics)) {
      setAlreadyDefault(true);
      return;
    }
    const confirmed = await confirm({
      title: 'Restaurar categorias padrão',
      message:
        'Voltam as quatro categorias padrão (Diversos, Investimentos, Metas e Conhecimentos), com nome, descrição, cor e porcentagem originais. As categorias que você criou saem da lista. Os meses anteriores não mudam.',
      confirmLabel: 'Restaurar',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;
    const previous = settings.topics;
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ ...settings, topics: restoreDefaultTopics(settings.topics) });
      showToast('Categorias padrão restauradas.', 'success', {
        action: {
          label: 'Desfazer',
          onClick: () =>
            void saveSettings({ ...settings, topics: previous }).catch(() =>
              showToast('Não foi possível desfazer. Tente de novo.', 'error'),
            ),
        },
      });
      onSaved?.();
    } catch {
      setError('Não foi possível restaurar. Tente novamente em alguns instantes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 px-4">
        <h2 className="text-muted text-sm font-semibold">
          {withTargets ? 'Categorias e metas' : 'Categorias'}
        </h2>
        <p className="bg-primary/10 text-foreground rounded-lg px-3 py-2 text-xs leading-relaxed">
          {KEEP_DEFAULT_TOPICS_ADVICE}
        </p>
        {!withTargets && modules.budget && (
          <p className="text-muted text-xs">As metas em % de cada categoria ficam na tela Categorias.</p>
        )}
        <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
          {shown.map((topic, index) => {
            const isNew = !savedIds.has(topic.id);
            return (
              <div key={topic.id} className="border-border flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="color"
                    value={resolveTopicColor(topic, index)}
                    onChange={(e) => updateTopic(topic.id, { color: e.target.value })}
                    aria-label={`Cor de ${topic.name || 'nova categoria'}`}
                    className="border-border h-10 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={topic.name}
                    onChange={(e) => updateTopic(topic.id, { name: e.target.value })}
                    placeholder="Nome da categoria"
                    maxLength={40}
                    className="border-border bg-background text-foreground focus:ring-primary min-h-[40px] w-0 min-w-0 flex-1 rounded-md border px-2 outline-none focus:ring-2"
                    aria-label="Nome da categoria"
                  />
                  {withTargets && (
                    <div className="flex shrink-0 items-center gap-1">
                      <PercentInput
                        value={topic.targetPct}
                        onChange={(pct) => updateTopic(topic.id, { targetPct: pct })}
                        ariaLabel={`Percentual de ${topic.name || 'nova categoria'}`}
                      />
                      <span className="text-muted">%</span>
                    </div>
                  )}
                </div>
                <textarea
                  value={topic.description ?? ''}
                  onChange={(e) => updateTopic(topic.id, { description: e.target.value })}
                  rows={3}
                  maxLength={300}
                  placeholder="Para que serve esta categoria?"
                  aria-label={`Descrição de ${topic.name || 'nova categoria'}`}
                  className="border-border bg-background text-foreground focus:ring-primary w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => moveTopic(topic.id, -1)}
                      disabled={index === 0}
                      aria-label="Mover para cima"
                      className="border-border text-foreground min-h-[36px] min-w-[36px] rounded-md border disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTopic(topic.id, 1)}
                      disabled={index === shown.length - 1}
                      aria-label="Mover para baixo"
                      className="border-border text-foreground min-h-[36px] min-w-[36px] rounded-md border disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void archiveTopic(topic)}
                    className="border-border text-muted min-h-[36px] shrink-0 rounded-md border px-3"
                  >
                    {isNew ? 'Desistir' : 'Arquivar'}
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => void addTopic()}
            className="border-border text-muted hover:text-foreground min-h-[44px] rounded-lg border border-dashed text-sm font-medium"
          >
            + Adicionar categoria
          </button>

          {withTargets && (
            <p className={`text-sm ${validation.valid ? 'text-success' : 'text-danger'}`}>
              {validation.valid
                ? 'Soma das categorias: 100%.'
                : validation.diffPct > 0
                  ? `Faltam ${formatPct(validation.diffPct)} para completar 100%.`
                  : `Excesso de ${formatPct(-validation.diffPct)} além de 100%.`}
            </p>
          )}
          {!namesFilled && <p className="text-danger text-sm">Dê um nome para cada categoria.</p>}
        </div>
      </section>

      <section className="flex flex-col gap-3 px-4">
        <h2 className="text-muted text-sm font-semibold">Categorias especiais</h2>
        <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
          {specialFields.map(({ key, label, explanation }) => (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex min-w-0 items-end gap-2">
                <input
                  type="color"
                  value={specialColors[key]}
                  onChange={(e) => setSpecialColors((c) => ({ ...c, [key]: e.target.value }))}
                  aria-label={`Cor de ${label}`}
                  className="border-border h-11 w-11 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                />
                <label className="text-muted flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  {label}
                  <input
                    type="text"
                    value={special[key]}
                    onChange={(e) => setSpecial((s) => ({ ...s, [key]: e.target.value }))}
                    className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] w-full min-w-0 rounded-md border px-3 outline-none focus:ring-2"
                  />
                </label>
              </div>
              <p className="text-muted text-xs">{explanation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 px-4">
        {error && (
          <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave || busy}
          className="bg-primary text-primary-foreground min-h-[44px] w-full rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Salvar categorias'}
        </button>
      </section>

      <section className="border-border flex flex-col gap-2 border-t px-4 pt-5">
        <button
          type="button"
          onClick={() => void handleRestore()}
          disabled={busy}
          className="border-border text-foreground min-h-[44px] w-full rounded-lg border px-4 text-sm font-medium disabled:opacity-50"
        >
          Restaurar categorias padrão
        </button>
        {alreadyDefault ? (
          <p className="text-success text-xs" role="status">
            Suas categorias já estão no padrão. Não há nada para restaurar.
          </p>
        ) : (
          <p className="text-muted text-xs">
            Criou categorias e não funcionou? Volte às quatro categorias padrão. As que você criou saem da
            lista, e os meses anteriores não mudam.
          </p>
        )}
      </section>
    </div>
  );
}
