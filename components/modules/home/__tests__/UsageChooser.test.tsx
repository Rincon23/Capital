import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SPECIAL_CATEGORY_LABELS, createDefaultTopics, type BudgetSettings } from '@/lib/budget';
import { MODULE_KEYS, resolveModules } from '@/lib/modules';
import { ToastProvider } from '@/components/ui/Toast';
import { UsageChooser } from '../UsageChooser';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const settingsState: { settings: BudgetSettings; saveSettings: ReturnType<typeof vi.fn> } = {
  settings: { topics: [], specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS },
  saveSettings: vi.fn(),
};

vi.mock('@/components/providers/SettingsProvider', () => ({
  useSettings: () => settingsState,
}));

function renderChooser() {
  settingsState.settings = { topics: createDefaultTopics(), specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS };
  settingsState.saveSettings = vi.fn().mockResolvedValue(undefined);
  const onKit = vi.fn();
  render(
    <ToastProvider>
      <UsageChooser onKit={onKit} />
    </ToastProvider>,
  );
  return { onKit, saved: () => settingsState.saveSettings.mock.calls[0]?.[0] as BudgetSettings | undefined };
}

const onModules = (settings: BudgetSettings | undefined) =>
  MODULE_KEYS.filter((key) => resolveModules(settings)[key]);

describe('Como você quer usar o Capital?', () => {
  beforeEach(() => push.mockClear());

  it('"Gastos e cartão de crédito" liga os três de uma vez e vai para as categorias', async () => {
    const { onKit, saved } = renderChooser();
    fireEvent.click(screen.getByRole('button', { name: /Gastos e cartão de crédito/ }));
    await waitFor(() => expect(onKit).toHaveBeenCalledTimes(1));
    expect(onModules(saved())).toEqual(['expenses', 'budget', 'card']);
    // Primeiros passos comes on, and Categorias does not ask the questions a second time.
    expect(saved()?.dismissedNotices).toEqual(['first-steps', 'intro:budget']);
    expect(push).not.toHaveBeenCalled();
  });

  it('"Controlar meus gastos" liga Lançamentos e Gastos por categoria', async () => {
    const { onKit, saved } = renderChooser();
    fireEvent.click(screen.getByRole('button', { name: /Controlar meus gastos/ }));
    await waitFor(() => expect(onKit).toHaveBeenCalledTimes(1));
    expect(onModules(saved())).toEqual(['expenses', 'budget']);
  });

  it('"Escolher do meu jeito" não liga nada e abre Módulos', async () => {
    const { onKit, saved } = renderChooser();
    fireEvent.click(screen.getByRole('button', { name: /Escolher do meu jeito/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/modulos'));
    expect(onModules(saved())).toEqual([]);
    expect(saved()?.dismissedNotices).toEqual(['first-steps']);
    expect(onKit).not.toHaveBeenCalled();
  });
});
