'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { MODULE_CATALOG, isModuleOn, type ModuleKey } from '@/lib/budget';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Guards a screen that belongs to an optional module. Reaching it with the module off (an old
 * link, a bookmark) explains what it is and offers to turn it on, instead of showing an empty
 * screen or a 404.
 */
export function ModuleGate({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { settings, loading } = useSettings();

  if (loading || !settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  if (isModuleOn(settings, module)) return <>{children}</>;

  const info = MODULE_CATALOG.find((entry) => entry.key === module);
  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader title={info?.name ?? 'Módulo desligado'} backHref="/carteira" />
      <div className="border-border bg-card mx-4 flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <p className="text-muted text-sm">{info?.description}</p>
        <p className="text-muted text-sm">
          Esse módulo está desligado. Ligue-o em Configurações para usá-lo.
        </p>
        <Link
          href="/configuracoes"
          className="bg-primary text-primary-foreground flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-semibold"
        >
          Abrir Configurações
        </Link>
      </div>
    </div>
  );
}
