'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';
import { currentMonthKey } from '@/lib/budget';
import { getLastViewedMonth } from '@/lib/storage/preferences';

interface TourStep {
  route: string;
  selector: string;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

interface AppTourProps {
  onSkip: () => void;
  onComplete: () => void;
}

/**
 * Real, interactive tour: a spotlight (driver.js) darkens the live screen and cuts
 * out the actual UI element being explained, navigating across the app's real routes.
 * Replaces the old static-slides tour that only showed 4 unrelated cards.
 */
export function AppTour({ onSkip, onComplete }: AppTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const skippedOrCompletedRef = useRef(false);

  useEffect(() => {
    const month = getLastViewedMonth() ?? currentMonthKey();

    const steps: TourStep[] = [
      {
        route: `/mes/${month}`,
        selector: '[data-tour="nav-mes"]',
        title: 'Início',
        description: 'Essa é a aba Início: seu painel principal, com suas categorias, quanto já gastou e quanto ainda pode gastar em cada uma.',
        side: 'top',
      },
      {
        route: `/mes/${month}`,
        selector: '[data-tour="posso-gastar"]',
        title: 'Quanto sobra',
        description: 'Esse número mostra quanto você ainda pode gastar esse mês, já descontando custos fixos e o que você já lançou.',
      },
      {
        route: `/mes/${month}`,
        selector: '[data-tour="categorias"]',
        title: 'Suas categorias',
        description: 'Cada categoria tem uma cor e um percentual da sua renda. Toque em uma delas para ver o detalhe dos gastos daquela categoria.',
      },
      {
        route: `/mes/${month}`,
        selector: '[data-tour="fab-lancar-gasto"]',
        title: 'Lançar gasto',
        description: 'Toque aqui sempre que fizer um gasto. Dá pra marcar se é de uma categoria, um custo fixo ou um imprevisto.',
        side: 'top',
      },
      {
        route: `/mes/${month}`,
        selector: '[data-tour="fab-renda"]',
        title: 'Registrar renda',
        description: 'E aqui você registra uma renda extra, sempre que entrar um dinheiro fora do previsto.',
        side: 'top',
      },
      {
        route: `/mes/${month}/lancamentos`,
        selector: '[data-tour="nav-lancamentos"]',
        title: 'Lançamentos',
        description: 'Aqui fica a lista completa de tudo que você lançou no mês, com filtros por categoria.',
        side: 'top',
      },
      {
        route: '/historico',
        selector: '[data-tour="nav-historico"]',
        title: 'Histórico',
        description: 'No Histórico você acompanha sua evolução mês a mês e vê se está seguindo o planejado.',
        side: 'top',
      },
      {
        route: '/configuracoes',
        selector: '[data-tour="nav-config"]',
        title: 'Configurações',
        description: 'E aqui nas Configurações você ajusta suas categorias.',
        side: 'top',
      },
      {
        route: '/configuracoes',
        selector: '[data-tour="config-categorias"]',
        title: 'Categorias de meta',
        description: 'Mude nomes, cores e percentuais de cada categoria quando quiser — juntos eles sempre têm que somar 100%.',
      },
      {
        route: '/configuracoes',
        selector: '[data-tour="config-ajuda"]',
        title: 'Precisa refazer?',
        description: 'A qualquer momento, toque aqui para refazer a configuração inicial e rever este tour.',
      },
    ];

    function finishOnce(action: () => void) {
      if (skippedOrCompletedRef.current) return;
      skippedOrCompletedRef.current = true;
      action();
    }

    const driveSteps: DriveStep[] = steps.map((step, index) => {
      const isLast = index === steps.length - 1;
      return {
        element: step.selector,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          onNextClick: () => {
            const next = steps[index + 1];
            if (next && next.route !== step.route) router.push(next.route);
            driverObj.moveNext();
          },
          onPrevClick: () => {
            const prev = steps[index - 1];
            if (prev && prev.route !== step.route) router.push(prev.route);
            driverObj.movePrevious();
          },
          ...(isLast
            ? {
                onDoneClick: () => {
                  driverObj.destroy();
                  finishOnce(onComplete);
                },
              }
            : {}),
        },
      };
    });

    const driverObj: Driver = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.7,
      stageRadius: 8,
      waitForElement: 4000,
      popoverClass: 'capital-tour-popover',
      nextBtnText: 'Próximo',
      prevBtnText: 'Voltar',
      doneBtnText: 'Concluir',
      steps: driveSteps,
      onDestroyStarted: () => {
        driverObj.destroy();
        finishOnce(onSkip);
      },
    });

    if (pathname !== steps[0].route) router.push(steps[0].route);
    driverObj.drive();

    return () => {
      driverObj.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
