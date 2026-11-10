'use client';

import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton } from '@/components/modules/ModuleHelpButton';
import { useHomeHref } from '@/components/modules/useHomeHref';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { SpendingHistory } from '@/components/history/SpendingHistory';

export function HistoricoScreen() {
  return (
    <ModuleGate module="history">
      <Historico />
    </ModuleGate>
  );
}

/**
 * Histórico: the months of the budget. (How the investments went is in the Invest +, since the
 * Diagrama moved there on 2026-11-09.)
 */
function Historico() {
  const backHref = useHomeHref();
  useModuleIntro('history', { ready: true });

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader title="Histórico" backHref={backHref} action={<ModuleHelpButton module="history" />} />
      <SpendingHistory />
    </div>
  );
}
