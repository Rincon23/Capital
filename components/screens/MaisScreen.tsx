'use client';

import { Blocks, PanelBottom, Settings, ShieldCheck } from 'lucide-react';
import { HOME_NAV, moduleDefinition, moreItems, navEntry } from '@/lib/modules';
import { useLastViewedMonth } from '@/lib/hooks/useLastViewedMonth';
import { PageHeader } from '@/components/layout/PageHeader';
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
        label: moduleDefinition(key).screen?.label ?? moduleDefinition(key).name,
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
      <PageHeader title="Mais" />
      <MoreMenu user={{ name: user.name, email: user.email }} sections={sections} />
    </div>
  );
}
