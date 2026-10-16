'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import type { ModuleKey } from '@/lib/budget';
import { isModuleOn, moduleDefinition, moduleNames, modulesToTurnOnFirst } from '@/lib/modules';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';
import { IconTile } from '@/components/ui/IconTile';
import { useHomeHref } from './useHomeHref';
import { MODULE_VISUALS } from './visuals';
import { turnOnTogetherLabel, useModuleSwitch } from './useModuleSwitch';

/**
 * Guards a module's screen. Reaching it with the module off (an old link, a bookmark) explains
 * what it is and offers to turn it on right here — or, when a module it depends on is off, to turn
 * it on together with what it needs ("Ligar os dois").
 */
export function ModuleGate({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { settings, loading } = useSettings();
  const { turnOn, turnOnWithParents, busy } = useModuleSwitch();
  const [turning, setTurning] = useState(false);
  const homeHref = useHomeHref();

  if (loading || !settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  if (isModuleOn(settings, module)) return <>{children}</>;

  const info = moduleDefinition(module);
  const missing = modulesToTurnOnFirst(settings, module);

  async function handleTurnOn() {
    setTurning(true);
    try {
      await (missing.length > 0 ? turnOnWithParents(module) : turnOn(module));
    } finally {
      setTurning(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader title={info.name} backHref={homeHref} />
      <div className="border-border bg-card mx-4 flex flex-col gap-4 rounded-2xl border p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <IconTile icon={MODULE_VISUALS[module].icon} tone={MODULE_VISUALS[module].tone} size="lg" />
          <div className="min-w-0">
            <p className="text-foreground font-semibold">{info.name}</p>
            <p className="text-muted text-sm">Este módulo está desligado.</p>
          </div>
        </div>
        <p className="text-muted text-sm">{info.description}</p>

        {missing.length > 0 ? (
          <p className="bg-background text-foreground flex items-start gap-2 rounded-xl px-3 py-2 text-sm">
            <Lock aria-hidden className="text-muted mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Para usar {info.name}, ligue também <strong>{moduleNames(missing)}</strong>.
            </span>
          </p>
        ) : (
          <p className="text-muted text-xs">Ligar não cria nenhum dado, e desligar depois não apaga nada.</p>
        )}
        <button
          type="button"
          onClick={() => void handleTurnOn()}
          disabled={busy || turning}
          className="bg-primary text-primary-foreground flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
        >
          {turning
            ? 'Ligando…'
            : missing.length > 0
              ? turnOnTogetherLabel(missing.length + 1)
              : `Ligar ${info.name}`}
        </button>
        <Link href="/modulos" className="text-primary text-center text-sm font-semibold">
          Ver todos os módulos
        </Link>
      </div>
    </div>
  );
}
