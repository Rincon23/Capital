'use client';

import { useActionState, useEffect, useState, type ChangeEvent } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/components/providers/AuthProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useTheme } from '@/components/providers/ThemeProvider';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { deleteAccount, signOut, type DeleteAccountState } from '@/lib/auth/actions';
import { budgetRepository, downloadBackup, readBackupFile } from '@/lib/storage';
import { hasLocalData, importLocalDataToCloud } from '@/lib/storage/localMigration';

/**
 * What belongs to no module: the account, the theme, backups and the local data of this device.
 * Módulos, Rodapé and Privacidade are entries of Mais, and each module's own settings live behind
 * the gear in its screen (categories in Categorias, reminder times in Lembretes, and so on).
 */
export function ConfiguracoesScreen() {
  const { settings } = useSettings();
  const { theme, setTheme } = useTheme();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [importError, setImportError] = useState<string | null>(null);

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
        'Isso apaga tudo o que você guardou no Capital, em todos os módulos: categorias, meses, rendas, gastos, cartões, parcelados, reservas, lembretes, a conexão com o Gmail e as notificações. A conta continua existindo. Essa ação não pode ser desfeita.',
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

  // Rendered on the client only, like every screen that waits for the settings: the theme lives in
  // this device's storage, so the server could only guess which button is selected.
  if (!settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-6 pb-10">
      <PageHeader title="Configurações" />

      <AccountSection />

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

function AccountSection() {
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);

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
        <button
          type="button"
          onClick={() => setDeleting(true)}
          className="text-danger min-h-[44px] w-full rounded-lg px-4 text-sm font-medium"
        >
          Excluir minha conta
        </button>
      </div>
      {deleting && <DeleteAccountSheet onClose={() => setDeleting(false)} />}
    </section>
  );
}

const NO_ERROR: DeleteAccountState = {};

/** Deletes the account and everything in it, once the password is typed again. */
function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(deleteAccount, NO_ERROR);

  return (
    <BottomSheet open onClose={onClose} title="Excluir minha conta">
      <form action={action} className="flex flex-col gap-4">
        <p className="text-muted text-sm">
          A conta e tudo o que ela guarda somem de vez: lançamentos de todos os módulos, lembretes, a conexão
          com o Gmail e os aparelhos que recebem notificações. Não dá para desfazer. Se quiser guardar uma
          cópia, use &quot;Exportar dados&quot; antes.
        </p>
        {state.error && (
          <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm" role="alert">
            {state.error}
          </p>
        )}
        <label className="text-muted flex flex-col gap-1 text-sm">
          Sua senha, para confirmar
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-md border px-3 outline-none focus:ring-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-danger min-h-[44px] w-full rounded-lg px-4 font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Excluindo…' : 'Excluir conta e todos os dados'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="border-border text-foreground min-h-[44px] w-full rounded-lg border px-4 text-sm font-medium"
        >
          Manter minha conta
        </button>
      </form>
    </BottomSheet>
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
