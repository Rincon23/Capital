import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  DEFAULT_SPECIAL_CATEGORY_LABELS,
  DEFAULT_TOPICS,
  FIXED_COST_TIP,
  createDefaultTopics,
  type BudgetSettings,
} from '@/lib/budget';
import { budgetRepository } from '@/lib/storage';
import { ConfirmProvider } from '@/components/ui/ConfirmSheet';
import { OnboardingWizard } from '../OnboardingWizard';

vi.mock('@/lib/storage', () => ({
  budgetRepository: {
    peekMonth: vi.fn().mockResolvedValue({ incomes: [], expenses: [] }),
    saveIncome: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/storage/preferences', () => ({
  getUnforeseenEstimate: () => 0,
  setUnforeseenEstimate: vi.fn(),
}));

function renderWizard(startAtPercentages = false) {
  const settings: BudgetSettings = {
    topics: createDefaultTopics(),
    specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS,
  };
  const saveSettings = vi.fn().mockResolvedValue(undefined);
  const onComplete = vi.fn();
  render(
    <ConfirmProvider>
      <OnboardingWizard
        settings={settings}
        saveSettings={saveSettings}
        onSkip={vi.fn()}
        onComplete={onComplete}
        startAtPercentages={startAtPercentages}
      />
    </ConfirmProvider>,
  );
  return { saveSettings, onComplete };
}

function next() {
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}

describe('OnboardingWizard (configuração das categorias)', () => {
  it('uma pergunta por vez: renda, custos fixos, imprevistos e as % com o limite de cada uma', async () => {
    const { onComplete } = renderWizard();

    // 1. Income: no intro screen before it.
    expect(screen.getByRole('heading', { name: 'Quanto você ganha por mês?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Renda por mês'), { target: { value: '5000,00' } });
    next();

    // 2. Fixed costs alone on the screen; the fixed-cost rule waits behind the ⓘ.
    expect(screen.getByRole('heading', { name: 'Quanto são seus custos fixos por mês?' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Imprevistos por mês')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Custos fixos por mês'), { target: { value: '1000,00' } });
    expect(screen.getByText(FIXED_COST_TIP)).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Quando um gasto é custo fixo?' }));
    expect(screen.getByText(FIXED_COST_TIP)).toBeVisible();
    next();

    // 3. Unforeseen costs, alone too.
    expect(screen.getByRole('heading', { name: 'E com imprevistos, em média?' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Imprevistos por mês'), { target: { value: '200,00' } });
    next();

    // 4. Each category says what it is for, with the limit its % leaves — and no total of them all.
    expect(screen.getByRole('heading', { name: 'Quanto vai para cada categoria?' })).toBeInTheDocument();
    for (const preset of DEFAULT_TOPICS) expect(screen.getByText(preset.description)).toBeInTheDocument();
    expect(screen.queryByText('R$ 3.800,00')).not.toBeInTheDocument();
    expect(screen.queryByText(/Para as categorias/)).not.toBeInTheDocument();
    // Prazeres: 20% of R$ 5.000 minus 20% of R$ 1.200.
    expect(screen.getByText('R$ 760,00')).toBeInTheDocument();
    expect(screen.getByText('Somam 100% ✓')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(budgetRepository.saveIncome).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ amount: 5000, source: 'Renda mensal' }),
    );
  });

  it('só muda as % das quatro: não tem como criar categoria', async () => {
    const { saveSettings, onComplete } = renderWizard();

    fireEvent.change(screen.getByLabelText('Renda por mês'), { target: { value: '5000,00' } });
    next();
    next();
    next();

    expect(screen.queryByRole('button', { name: /adicionar categoria/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Percentual de Prazeres', { selector: 'input' }), {
      target: { value: '10' },
    });
    expect(screen.getByRole('button', { name: 'Pronto' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Percentual de Metas', { selector: 'input' }), {
      target: { value: '35' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const topics = (saveSettings.mock.calls[0][0] as BudgetSettings).topics;
    expect(topics.map((t) => t.name)).toEqual(DEFAULT_TOPICS.map((t) => t.name));
    expect(topics.map((t) => t.targetPct)).toEqual([0.1, 0.45, 0.35, 0.1]);
  });

  it('"Ajustar as %" abre direto nas %, e "Voltar" ainda chega nas outras perguntas', () => {
    renderWizard(true);

    expect(screen.getByRole('heading', { name: 'Quanto vai para cada categoria?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'E com imprevistos, em média?' })).toBeInTheDocument();
  });
});
