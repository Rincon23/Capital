'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { ReminderSettingsSection } from '@/components/settings/ReminderSettingsSection';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useTheme } from '@/components/providers/ThemeProvider';
import { PercentInput } from '@/components/ui/PercentInput';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { signOut } from '@/lib/auth/actions';
import { budgetRepository, downloadBackup, readBackupFile } from '@/lib/storage';
import { hasLocalData, importLocalDataToCloud } from '@/lib/storage/localMigration';
import {
  DEFAULT_TOPIC_COLORS,
  MODULE_CATALOG,
  REIMBURSABLE_EXPLANATION,
  createId,
  formatPct,
  resolveModules,
  resolveSpecialCategoryColors,
  resolveSpecialCategoryLabels,
  resolveTopicColor,
  validateTopicPercentages,
  type BudgetSettings,
  type ModuleFlags,
  type ModuleKey,
  type ResolvedSpecialCategoryLabels,
  type SpecialCategoryColors,
  type TopicConfig,
} from '@/lib/budget';

const SPECIAL_CATEGORY_FIELDS: { key: keyof ResolvedSpecialCategoryLabels; label: string }[] = [
  { key: 'fixedCost', label: 'Custo fixo' },
  { key: 'unforeseen', label: 'Imprevistos' },
];

export function ConfiguracoesScreen() {
  const { settings, saveSettings, loading } = useSettings();

  if (loading || !settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  return <ConfiguracoesForm settings={settings} saveSettings={saveSettings} />;
}

function ConfiguracoesForm({
  settings,
  saveSettings,
}: {
  settings: BudgetSettings;
  saveSettings: (settings: BudgetSettings) => Promise<void>;
}) {
  const { theme, setTheme } = useTheme();
  const confirm = useConfirm();
  const { showToast } = useToast();

  // Local editable draft, seeded once from the already-loaded settings (lazy initial state
  // — no effect needed since this component only mounts after `settings` is available).
  const [topics, setTopics] = useState<TopicConfig[]>(() => settings.topics);
  const [special, setSpecial] = useState<ResolvedSpecialCategoryLabels>(() =>
    resolveSpecialCategoryLabels(settings),
  );
  const [specialColors, setSpecialColors] = useState<SpecialCategoryColors>(() =>
    resolveSpecialCategoryColors(settings),
  );
  const [modules, setModules] = useState<ModuleFlags>(() => resolveModules(settings));
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validation = validateTopicPercentages(topics);
  const sortedTopics = [...topics].sort((a, b) => a.order - b.order);
  // The "A receber" label and color only make sense while its module is on.
  const specialFields = modules.reimbursable
    ? [...SPECIAL_CATEGORY_FIELDS, { key: 'reimbursable' as const, label: 'A receber' }]
    : SPECIAL_CATEGORY_FIELDS;

  function updateTopic(id: string, patch: Partial<TopicConfig>) {
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function moveTopic(id: string, direction: -1 | 1) {
    setTopics((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((t) => t.id === id);
      const swapIdx = idx + direction;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      return sorted.map((t, i) => {
        if (i === idx) return { ...t, order: sorted[swapIdx].order };
        if (i === swapIdx) return { ...t, order: sorted[idx].order };
        return t;
      });
    });
  }

  function addTopic() {
    setTopics((prev) => [
      ...prev,
      {
        id: createId(),
        name: 'Nova categoria',
        targetPct: 0,
        order: prev.length,
        color: DEFAULT_TOPIC_COLORS[prev.length % DEFAULT_TOPIC_COLORS.length],
      },
    ]);
  }

  function toggleArchived(id: string) {
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, archived: !t.archived } : t)));
  }

  async function deleteTopic(id: string) {
    const topic = topics.find((t) => t.id === id);
    const confirmed = await confirm({
      title: 'Excluir categoria',
      message: `Excluir a categoria "${topic?.name ?? ''}"? Ela some das configurações, do mês atual e dos próximos meses. Meses passados não mudam.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) {
      showToast('Operação cancelada. Nenhuma alteração foi realizada.', 'info');
      return;
    }
    setTopics((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleSave() {
    if (!validation.valid) return;
    setBusy(true);
    try {
      await saveSettings({
        topics,
        specialCategories: special,
        specialCategoryColors: specialColors,
        modules,
      });
      showToast('Configurações salvas.');
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    const payload = await budgetRepository.exportData();
    downloadBackup(payload);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError(null);
    try {
      const payload = await readBackupFile(file);
      await budgetRepository.importData(payload);
      // Full reload (not router navigation): every screen's IndexedDB-backed state must
      // be re-read from scratch after a wholesale data replacement.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/';
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao importar.');
    }
  }

  async function handleClearAll() {
    const confirmed = await confirm({
      title: 'Apagar todos os dados',
      message:
        'Isso apaga todos os dados da sua conta no Capital: categorias, meses, rendas e gastos. Essa ação não pode ser desfeita.',
      confirmLabel: 'Apagar tudo',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) {
      showToast('Operação cancelada. Nenhuma alteração foi realizada.', 'info');
      return;
    }
    await budgetRepository.clearAll();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/';
  }

  return (
    <div className="flex flex-1 flex-col gap-6 pb-10">
      <PageHeader title="Configurações" />

      <AccountSection />

      <HelpSection />

      <section className="flex flex-col gap-3 px-4" data-tour="config-categorias">
        <h2 className="text-muted text-sm font-semibold">Categorias de meta</h2>
        <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
          {sortedTopics.map((topic, index) => (
            <div
              key={topic.id}
              className={`border-border flex flex-col gap-2 rounded-lg border p-3 ${topic.archived ? 'opacity-50' : ''}`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="color"
                  value={resolveTopicColor(topic, index)}
                  onChange={(e) => updateTopic(topic.id, { color: e.target.value })}
                  aria-label={`Cor de ${topic.name}`}
                  className="border-border h-10 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                />
                <input
                  type="text"
                  value={topic.name}
                  onChange={(e) => updateTopic(topic.id, { name: e.target.value })}
                  className="border-border bg-background text-foreground focus:ring-primary min-h-[40px] w-0 min-w-0 flex-1 rounded-md border px-2 outline-none focus:ring-2"
                  aria-label="Nome da categoria"
                />
                <div className="flex shrink-0 items-center gap-1">
                  <PercentInput
                    value={topic.targetPct}
                    onChange={(pct) => updateTopic(topic.id, { targetPct: pct })}
                    ariaLabel={`Percentual de ${topic.name}`}
                  />
                  <span className="text-muted">%</span>
                </div>
              </div>
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
                    disabled={index === sortedTopics.length - 1}
                    aria-label="Mover para baixo"
                    className="border-border text-foreground min-h-[36px] min-w-[36px] rounded-md border disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => toggleArchived(topic.id)}
                    className="border-border text-muted min-h-[36px] rounded-md border px-3"
                  >
                    {topic.archived ? 'Reativar' : 'Arquivar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteTopic(topic.id)}
                    className="border-danger text-danger min-h-[36px] rounded-md border px-3"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addTopic}
            className="border-border text-muted hover:text-foreground min-h-[44px] rounded-lg border border-dashed text-sm font-medium"
          >
            + Adicionar categoria
          </button>

          <p className={`text-sm ${validation.valid ? 'text-success' : 'text-danger'}`}>
            {validation.valid
              ? 'Soma das categorias ativas: 100%.'
              : validation.diffPct > 0
                ? `Faltam ${formatPct(validation.diffPct)} para completar 100%.`
                : `Excesso de ${formatPct(-validation.diffPct)} além de 100%.`}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3 px-4">
        <h2 className="text-muted text-sm font-semibold">Categorias especiais</h2>
        <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
          {specialFields.map(({ key, label }) => (
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
              {key === 'reimbursable' && <p className="text-muted text-xs">{REIMBURSABLE_EXPLANATION}</p>}
            </div>
          ))}
        </div>
      </section>

      <ModulesSection modules={modules} onChange={setModules} />

      <section className="px-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!validation.valid || busy}
          className="bg-primary text-primary-foreground min-h-[44px] w-full rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </section>

      {/* Notifications exist for the reminders and the Gmail monitor: without them, nothing new shows up here. */}
      {(resolveModules(settings).reminders || resolveModules(settings).gmail) && <NotificationsSection />}
      {resolveModules(settings).reminders && <ReminderSettingsSection />}

      <section className="flex flex-col gap-3 px-4">
        <h2 className="text-muted text-sm font-semibold">Tema</h2>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTheme(option)}
              className={`min-h-[44px] flex-1 rounded-lg border px-3 text-sm font-medium ${
                theme === option
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground'
              }`}
            >
              {option === 'light' ? 'Claro' : option === 'dark' ? 'Escuro' : 'Sistema'}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 px-4">
        <h2 className="text-muted text-sm font-semibold">Backup</h2>
        <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
          <button
            type="button"
            onClick={handleExport}
            className="border-border text-foreground min-h-[44px] rounded-lg border px-4 text-sm font-medium"
          >
            Exportar dados
          </button>
          <label className="border-border text-foreground flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-4 text-sm font-medium">
            Importar dados
            <input type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
          </label>
          {importError && <p className="text-danger text-sm">{importError}</p>}
        </div>
      </section>

      <LocalDataSection />

      <section className="px-4">
        <button
          type="button"
          onClick={() => void handleClearAll()}
          className="border-danger text-danger min-h-[44px] w-full rounded-lg border px-4 text-sm font-semibold"
        >
          Apagar todos os dados
        </button>
      </section>
    </div>
  );
}

/**
 * The optional assistant modules. Everything is off until the user turns it on here, so an
 * account that ignores this section keeps exactly the app it had. Modules still being built
 * are listed but cannot be turned on. Every module is for every user: each one turns on their own.
 */
function ModulesSection({
  modules,
  onChange,
}: {
  modules: ModuleFlags;
  onChange: (next: ModuleFlags) => void;
}) {
  function toggle(key: ModuleKey) {
    onChange({ ...modules, [key]: !modules[key] });
  }

  return (
    <section className="flex flex-col gap-3 px-4" data-tour="config-modulos">
      <h2 className="text-muted text-sm font-semibold">Módulos</h2>
      <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <p className="text-muted text-sm">
          Recursos extras do Capital. Ligue só o que você usa — o que ficar desligado não aparece em lugar
          nenhum do app.
        </p>
        {MODULE_CATALOG.map((info) => (
          <div key={info.key} className="border-border flex items-start gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-medium">{info.name}</p>
              <p className="text-muted mt-0.5 text-xs">{info.description}</p>
              {!info.available && <p className="text-muted mt-1 text-xs italic">Em breve.</p>}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={modules[info.key]}
              aria-label={info.name}
              disabled={!info.available}
              onClick={() => toggle(info.key)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                modules[info.key] ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                aria-hidden
                className={`bg-card absolute top-1 h-5 w-5 rounded-full shadow transition-all ${
                  modules[info.key] ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function HelpSection() {
  const { open } = useOnboarding();

  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-muted text-sm font-semibold">Ajuda</h2>
      <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
        <button
          type="button"
          onClick={open}
          data-tour="config-ajuda"
          className="border-border text-foreground min-h-[44px] w-full rounded-lg border px-4 text-sm font-medium"
        >
          Me ajude a configurar
        </button>
        <p className="text-muted mt-2 text-sm">
          Refaça o assistente de configuração e o tour do app a qualquer momento.
        </p>
      </div>
    </section>
  );
}

function AccountSection() {
  const { user } = useAuth();

  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-muted text-sm font-semibold">Conta</h2>
      <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <p className="text-foreground text-sm break-all">{user.email ?? 'Sessão ativa'}</p>
        <form action={signOut}>
          <button
            type="submit"
            className="border-border text-foreground min-h-[44px] w-full rounded-lg border px-4 text-sm font-medium"
          >
            Sair
          </button>
        </form>
      </div>
    </section>
  );
}

function LocalDataSection() {
  const confirm = useConfirm();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void hasLocalData().then((has) => {
      if (active) setAvailable(has);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  async function handleImport() {
    const confirmed = await confirm({
      title: 'Importar dados deste dispositivo',
      message:
        'Importar os dados salvos neste dispositivo substitui os dados atuais da sua conta. Essa ação não pode ser desfeita.',
      confirmLabel: 'Importar',
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await importLocalDataToCloud();
      // Full reload (not router navigation): every screen's repository-backed state
      // must be re-read from scratch after a wholesale data replacement.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar.');
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-muted text-sm font-semibold">Dados locais deste dispositivo</h2>
      <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
        <p className="text-muted text-sm">
          Este dispositivo tem dados da versão anterior (salvos só no navegador). Importe-os para a sua conta
          para acessá-los em qualquer lugar.
        </p>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={busy}
          className="border-border text-foreground min-h-[44px] rounded-lg border px-4 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Importando…' : 'Importar dados deste dispositivo'}
        </button>
        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
    </section>
  );
}
