'use client';

import { useEffect, useState } from 'react';
import { Blocks, LayoutGrid, List, PanelBottom, Settings, ShieldCheck } from 'lucide-react';
import { HOME_NAV, moduleDefinition, moreItems, navEntry } from '@/lib/modules';
import { useLastViewedMonth } from '@/lib/hooks/useLastViewedMonth';
import {
  getStoredMoreLayout,
  setStoredMoreLayout,
  type MoreLayout,
} from '@/lib/storage/preferences';
import { PageHeader } from '@/components/layout/PageHeader';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { MoreMenu, type MoreMenuSection } from '@/components/layout/MoreMenu';
import { HOME_VISUAL, MODULE_VISUALS } from '@/components/modules/visuals';
import { useAuth } from '@/components/providers/AuthProvider';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * The full list: Início, the screen of every module that is on (grouped, including the ones also in
 * the bottom bar) and the entries that always live here. Each module's help and settings are in
 * its own screen, so there is no general help entry.
 */
export function MaisScreen() {
  const { user } = useAuth();
  const { settings } = useSettings();
  // Mais has no month of its own; month screens open on the one last seen.
  const month = useLastViewedMonth();
  // The list is what the server renders; the choice saved on this device (localStorage) is
  // applied after mount, so hydration never sees a mismatch.
  const [layout, setLayout] = useState<MoreLayout>('list');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(getStoredMoreLayout());
  }, []);

  function toggleLayout() {
    const next: MoreLayout = layout === 'grid' ? 'list' : 'grid';
    setLayout(next);
    setStoredMoreLayout(next);
  }

  const sections: MoreMenuSection[] = [
    {
      title: 'Painel',
      items: [
        {
          key: 'inicio',
          label: HOME_NAV.label,
          description: 'Um resumo de cada módulo ligado',
          icon: HOME_VISUAL.icon,
          tone: HOME_VISUAL.tone,
          href: HOME_NAV.href(month),
        },
      ],
    },
    ...moreItems(settings).map((group) => ({
      title: group.label,
      items: group.keys.map((key) => ({
        key,
        label: moduleDefinition(key).name,
        description: moduleDefinition(key).tagline,
        icon: MODULE_VISUALS[key].icon,
        tone: MODULE_VISUALS[key].tone,
        href: navEntry(key).href(month),
      })),
    })),
    {
      title: 'Ajustes',
      items: [
        {
          key: 'modulos',
          label: 'Módulos',
          description: 'Escolha o que o seu Capital tem',
          icon: Blocks,
          tone: 'blue',
          href: '/modulos',
        },
        {
          key: 'rodape',
          label: 'Rodapé',
          description: 'Escolha e ordene os ícones de baixo',
          icon: PanelBottom,
          tone: 'purple',
          href: '/rodape',
        },
        {
          key: 'privacidade',
          label: 'Privacidade',
          description: 'Como o Capital trata os seus dados',
          icon: ShieldCheck,
          tone: 'green',
          href: '/privacidade',
        },
        {
          key: 'configuracoes',
          label: 'Configurações',
          description: 'Conta, tema e backup',
          icon: Settings,
          tone: 'neutral',
          href: '/configuracoes',
        },
      ],
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader
        title="Mais"
        action={
          <>
            <LayoutToggle layout={layout} onToggle={toggleLayout} />
            <NotificationBell />
          </>
        }
      />
      <MoreMenu user={{ name: user.name, email: user.email }} sections={sections} layout={layout} />
    </div>
  );
}

/** Switches Mais between the settings list and the app-drawer grid; sits next to the bell. */
function LayoutToggle({ layout, onToggle }: { layout: MoreLayout; onToggle: () => void }) {
  const Icon = layout === 'grid' ? List : LayoutGrid;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={layout === 'grid' ? 'Ver em lista' : 'Ver em grade'}
      className="text-muted hover:text-foreground hover:bg-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
    >
      <Icon aria-hidden className="h-5 w-5" />
    </button>
  );
}
