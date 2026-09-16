'use client';

import { ChartColumn, CircleHelp, Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MoreMenu } from '@/components/layout/MoreMenu';
import { useOnboarding } from '@/components/onboarding/OnboardingProvider';
import { useAuth } from '@/components/providers/AuthProvider';

/**
 * Everything that moves out of the bottom bar once the assistant modules fill it up
 * (see `navKeysFor`). Reachable by the "Mais" tab, which only appears in that case.
 */
export function MaisScreen() {
  const { user } = useAuth();
  const { open: openTour } = useOnboarding();

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader title="Mais" />
      <MoreMenu
        user={{ name: user.name, email: user.email }}
        sections={[
          {
            title: 'Acompanhar',
            items: [
              {
                key: 'historico',
                label: 'Histórico',
                description: 'Sua evolução mês a mês',
                icon: ChartColumn,
                tone: 'blue',
                href: '/historico',
              },
            ],
          },
          {
            title: 'Ajustes',
            items: [
              {
                key: 'configuracoes',
                label: 'Configurações',
                description: 'Categorias, módulos e tema',
                icon: Settings,
                tone: 'neutral',
                href: '/configuracoes',
              },
              {
                key: 'ajuda',
                label: 'Ajuda',
                description: 'Rever o tour do app',
                icon: CircleHelp,
                tone: 'amber',
                onClick: openTour,
              },
            ],
          },
        ]}
      />
    </div>
  );
}
