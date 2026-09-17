import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  DEFAULT_SPECIAL_CATEGORY_LABELS,
  DEFAULT_TOPICS,
  FIXED_COST_TIP,
  createDefaultTopics,
  type BudgetSettings,
} from '@/lib/budget';
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

function renderWizard() {
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
        intro={{ title: 'Quanto vai para cada categoria?', text: 'Teste' }}
        onSkip={vi.fn()}
        onComplete={onComplete}
      />
    </ConfirmProvider>,
  );
  return { saveSettings, onComplete };
}

function next(label = 'Continuar') {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('OnboardingWizard (Me ajude com as %)', () => {
  it('explica cada categoria e deixa criar uma, depois do aviso, salvando nome e descrição', async () => {
    const { saveSettings, onComplete } = renderWizard();

    next('Começar');
    fireEvent.change(screen.getByLabelText(/valor em reais/i), { target: { value: '5000,00' } });
    next();
    expect(screen.getByText(FIXED_COST_TIP)).toBeInTheDocument();
    next();
    next();

    expect(screen.getByText('Para que serve cada categoria')).toBeInTheDocument();
    for (const preset of DEFAULT_TOPICS) expect(screen.getByText(preset.description)).toBeInTheDocument();
    next();

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar categoria' }));
    const dialog = await screen.findByRole('dialog', { name: /criar uma categoria nova/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar mesmo assim' }));

    const name = await screen.findByLabelText('Nome da nova categoria');
    // Without a name the setup cannot be finished.
    expect(screen.getByRole('button', { name: 'Concluir configuração' })).toBeDisabled();
    fireEvent.change(name, { target: { value: 'Pets' } });
    fireEvent.change(screen.getByLabelText('Descrição da nova categoria'), {
      target: { value: 'Ração e veterinário' },
    });
    fireEvent.change(screen.getByLabelText('Percentual de Diversos', { selector: 'input' }), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText('Percentual da nova categoria', { selector: 'input' }), {
      target: { value: '10' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Concluir configuração' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const topics = (saveSettings.mock.calls[0][0] as BudgetSettings).topics;
    expect(topics).toHaveLength(5);
    expect(topics.at(-1)).toMatchObject({ name: 'Pets', description: 'Ração e veterinário', targetPct: 0.1 });
  });
});
