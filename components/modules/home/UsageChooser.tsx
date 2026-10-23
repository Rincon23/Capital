'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Blocks, ChevronRight, LoaderCircle } from 'lucide-react';
import { FIRST_STEPS_NOTICE, MODULE_KITS, turnModulesOn, type ModuleKit } from '@/lib/modules';
import { useSettings } from '@/components/providers/SettingsProvider';
import { IconTile } from '@/components/ui/IconTile';
import { useToast } from '@/components/ui/Toast';
import { introNotice } from '../useModuleIntro';
import { MODULE_VISUALS } from '../visuals';

const CARD =
  'border-border bg-card hover:border-primary/40 flex min-h-[88px] w-full items-center gap-4 rounded-2xl border p-4 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-60';

/**
 * "Como você quer usar o Capital?": what a new account (no module on) sees on the Início. A kit
 * turns its modules on with one tap and goes straight to the categories (`onKit`); "Escolher do
 * meu jeito" opens Módulos. Either way the account gets "Primeiros passos" on the Início.
 */
export function UsageChooser({ onKit }: { onKit: () => void }) {
  const { settings, saveSettings } = useSettings();
  const { showToast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<ModuleKit['key'] | 'custom' | null>(null);

  async function pick(kit: ModuleKit | null) {
    if (!settings || busy) return;
    const turnedOn = kit ? turnModulesOn(settings, kit.modules) : null;
    if (turnedOn && !turnedOn.ok) return;
    setBusy(kit?.key ?? 'custom');
    const notices = settings.dismissedNotices ?? [];
    // With a kit the categories are set up right now, so Categorias does not ask again on its first visit.
    const add = [FIRST_STEPS_NOTICE, ...(kit ? [introNotice('budget')] : [])].filter(
      (notice) => !notices.includes(notice),
    );
    try {
      await saveSettings({
        ...settings,
        ...(turnedOn ? { modules: turnedOn.modules } : {}),
        dismissedNotices: [...notices, ...add],
      });
    } catch {
      setBusy(null);
      showToast('Não foi possível salvar. Tente de novo.', 'error');
      return;
    }
    if (kit) onKit();
    else router.push('/modulos');
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-foreground px-1 pt-2 pb-1 text-2xl font-bold">Como você quer usar o Capital +?</h1>
      {MODULE_KITS.map((kit) => (
        <button
          key={kit.key}
          type="button"
          onClick={() => void pick(kit)}
          disabled={busy !== null}
          className={CARD}
        >
          <KitIcon kit={kit} />
          <span className="min-w-0 flex-1">
            <span className="text-foreground block font-semibold">{kit.name}</span>
            <span className="text-muted block text-sm">{kit.line}</span>
          </span>
          {busy === kit.key ? (
            <LoaderCircle aria-label="Ligando" className="text-primary h-5 w-5 shrink-0 animate-spin" />
          ) : (
            <ChevronRight aria-hidden className="text-muted h-5 w-5 shrink-0" />
          )}
        </button>
      ))}
      <button type="button" onClick={() => void pick(null)} disabled={busy !== null} className={CARD}>
        <IconTile icon={Blocks} tone="neutral" size="lg" />
        <span className="min-w-0 flex-1">
          <span className="text-foreground block font-semibold">Escolher do meu jeito</span>
          <span className="text-muted block text-sm">Ligue só os módulos que quiser.</span>
        </span>
        {busy === 'custom' ? (
          <LoaderCircle aria-label="Abrindo" className="text-primary h-5 w-5 shrink-0 animate-spin" />
        ) : (
          <ChevronRight aria-hidden className="text-muted h-5 w-5 shrink-0" />
        )}
      </button>
      <p className="text-muted px-1 text-center text-xs">Dá para mudar depois, em Módulos.</p>
    </div>
  );
}

/** A kit is shown by the icon of the module it adds last, the one that tells it apart. */
function KitIcon({ kit }: { kit: ModuleKit }) {
  const visual = MODULE_VISUALS[kit.modules[kit.modules.length - 1]];
  return <IconTile icon={visual.icon} tone={visual.tone} size="lg" />;
}
