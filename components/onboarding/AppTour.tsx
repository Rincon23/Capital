'use client';

import { useState } from 'react';
import { OnboardingScreen } from './OnboardingScreen';

interface TourCard {
  title: string;
  body: string;
  color: string;
}

const CARDS: TourCard[] = [
  {
    title: 'Mês',
    body: 'Aqui você vê suas categorias, quanto já gastou e quanto ainda pode gastar em cada uma.',
    color: '#2a78d6',
  },
  {
    title: 'Lançamentos',
    body: 'Registre gastos e rendas aqui. Dá pra separar por categoria, custo fixo ou imprevisto.',
    color: '#1baf7a',
  },
  {
    title: 'Histórico',
    body: 'Acompanhe sua evolução mês a mês e veja se está seguindo o planejado.',
    color: '#eda100',
  },
  {
    title: 'Configurações',
    body: "Ajuste categorias, cores e percentuais quando quiser. Se precisar reconfigurar tudo de novo, é só voltar aqui e tocar em \"Me ajude a configurar\".",
    color: '#e87ba4',
  },
];

interface AppTourProps {
  onSkip: () => void;
  onComplete: () => void;
}

/** Short guided tour of the app's four main screens, shown right after the setup wizard. */
export function AppTour({ onSkip, onComplete }: AppTourProps) {
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const isLast = index === CARDS.length - 1;

  function next() {
    if (isLast) onComplete();
    else setIndex((i) => i + 1);
  }

  function back() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <OnboardingScreen
      step={index + 1}
      totalSteps={CARDS.length}
      onSkip={onSkip}
      footer={
        <>
          {index > 0 && (
            <button
              type="button"
              onClick={back}
              className="border-border text-foreground min-h-[44px] shrink-0 rounded-lg border px-4 py-2 font-medium"
            >
              Voltar
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="bg-primary text-primary-foreground min-h-[44px] flex-1 rounded-lg px-4 py-2 font-semibold"
          >
            {isLast ? 'Concluir' : 'Próximo'}
          </button>
        </>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white"
          style={{ backgroundColor: card.color }}
        >
          {index + 1}
        </span>
        <h1 className="text-foreground text-2xl font-bold">{card.title}</h1>
        <p className="text-muted max-w-sm text-base">{card.body}</p>
      </div>
    </OnboardingScreen>
  );
}
