'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useTheme } from '@/components/providers/ThemeProvider';
import { signOut } from '@/lib/auth/actions';
import { budgetRepository, downloadBackup, readBackupFile } from '@/lib/storage';
import { hasLocalData, importLocalDataToCloud } from '@/lib/storage/localMigration';
import {
  DEFAULT_TOPIC_COLORS,
  createId,
  formatPct,
  resolveSpecialCategoryColors,
  resolveTopicColor,
  validateTopicPercentages,
  type BudgetSettings,
  type SpecialCategoryColors,
  type SpecialCategoryLabels,
  type TopicConfig,
} from '@/lib/budget';

const SPECIAL_CATEGORY_FIELDS: { key: keyof SpecialCategoryLabels; label: string }[] = [
  { key: 'fixedCost', label: 'Custo fixo' },
  { key: 'unforeseen', label: 'Imprevistos' },
  { key: 'reimbursed', label: 'Ressarcido' },
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

  // Local editable draft, seeded once from the already-loaded settings (lazy initial state
  // — no effect needed since this component only mounts after `settings` is available).
  const [topics, setTopics] = useState<TopicConfig[]>(() => settings.topics);
  const [special, setSpecial] = useState<SpecialCategoryLabels>(() => settings.specialCategories);
  const [specialColors, setSpecialColors] = useState<SpecialCategoryColors>(() =>
    resolveSpecialCategoryColors(settings),
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validation = validateTopicPercentages(topics);
  const sortedTopics = [...topics].sort((a, b) => a.order - b.order);

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

  function deleteTopic(id: string) {
    const topic = topics.find((t) => t.id === id);
    const confirmed = window.confirm(
      `Excluir a categoria "${topic?.name ?? ''}"? Ela some das configurações e dos próximos meses. ` +
        'Os meses já criados não mudam.',
    );
    if (!confirmed) return;
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
      });
      setSaveMessage('Configurações salvas.');
      setTimeout(() => setSaveMessage(null), 2500);
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
    const confirmed = window.confirm(
      'Isso apaga todos os dados do Capital neste dispositivo. Essa ação não pode ser desfeita. Continuar?',
    );
    if (!confirmed) return;
    await budgetRepository.clearAll();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/';
  }

  return (
    <div className="flex flex-1 flex-col gap-6 pb-10">
      <PageHeader title="Configurações" />

      <AccountSection />

      <section className="flex flex-col gap-3 px-4">
        <h2 className="text-muted text-sm font-semibold">Categorias de meta</h2>
        <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
          {sortedTopics.map((topic, index) => (
            <div
              key={topic.id}
              className={`border-border flex flex-col gap-2 rounded-lg border p-3 ${topic.archived ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-2">
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
                  className="border-border bg-background text-foreground focus:ring-primary min-h-[40px] flex-1 rounded-md border px-2 outline-none focus:ring-2"
                  aria-label="Nome da categoria"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={Math.round(topic.targetPct * 1000) / 10}
                    onChange={(e) => updateTopic(topic.id, { targetPct: Number(e.target.value) / 100 })}
                    className="border-border bg-background text-foreground focus:ring-primary min-h-[40px] w-16 rounded-md border px-2 text-right outline-none focus:ring-2"
                    aria-label="Percentual"
                  />
                  <span className="text-muted">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex gap-1">
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
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => toggleArchived(topic.id)}
                    className="border-border text-muted min-h-[36px] rounded-md border px-3"
                  >
                    {topic.archived ? 'Reativar' : 'Arquivar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTopic(topic.id)}
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
          {SPECIAL_CATEGORY_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex items-end gap-2">
              <input
                type="color"
                value={specialColors[key]}
                onChange={(e) => setSpecialColors((c) => ({ ...c, [key]: e.target.value }))}
                aria-label={`Cor de ${label}`}
                className="border-border h-11 w-11 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
              <label className="text-muted flex flex-1 flex-col gap-1 text-sm">
                {label}
                <input
                  type="text"
                  value={special[key]}
                  onChange={(e) => setSpecial((s) => ({ ...s, [key]: e.target.value }))}
                  className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-md border px-3 outline-none focus:ring-2"
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!validation.valid || busy}
          className="bg-primary text-primary-foreground min-h-[44px] w-full rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {saveMessage && <p className="text-success mt-2 text-center text-sm">{saveMessage}</p>}
      </section>

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
          onClick={handleClearAll}
          className="border-danger text-danger min-h-[44px] w-full rounded-lg border px-4 text-sm font-semibold"
        >
          Apagar todos os dados
        </button>
      </section>
    </div>
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
    const confirmed = window.confirm(
      'Importar os dados salvos neste dispositivo substitui os dados atuais da sua conta na nuvem. Continuar?',
    );
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
          Este dispositivo tem dados da versão anterior (salvos só no navegador). Importe-os para a
          sua conta para acessá-los em qualquer lugar.
        </p>
        <button
          type="button"
          onClick={handleImport}
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
