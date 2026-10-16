import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SPECIAL_CATEGORY_LABELS, createDefaultTopics, type BudgetSettings, type MonthData } from '@/lib/budget';
import { ToastProvider } from '@/components/ui/Toast';
import { FirstStepsHomeCard } from '../FirstStepsHomeCard';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const month = {
  month: '2026-10',
  monthData: { incomes: [{ id: 'i1', source: 'Salário', amount: 3000 }], expenses: [] } as unknown as MonthData,
  openIncomeForm: vi.fn(),
  openExpenseForm: vi.fn(),
};
vi.mock('@/components/month/MonthContext', () => ({ useMonthContext: () => month }));

const settingsState: { settings: BudgetSettings; saveSettings: ReturnType<typeof vi.fn> } = {
  settings: {
    topics: createDefaultTopics(),
    specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS,
    dismissedNotices: ['first-steps'],
  },
  saveSettings: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/components/providers/SettingsProvider', () => ({ useSettings: () => settingsState }));

describe('Primeiros passos (widget)', () => {
  it('marca sozinho o que o mês já tem e cada passo abre o lugar certo', async () => {
    render(
      <ToastProvider>
        <FirstStepsHomeCard />
      </ToastProvider>,
    );

    expect(screen.getByText('1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar a renda (feito)' })).toBeInTheDocument();
    // Saved, so it stays done next month.
    await waitFor(() =>
      expect(settingsState.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ dismissedNotices: ['first-steps', 'first-steps:income'] }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lançar o primeiro gasto' }));
    expect(month.openExpenseForm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ver quanto ainda posso gastar' }));
    expect(push).toHaveBeenCalledWith('/mes/2026-10/categorias');
  });
});
