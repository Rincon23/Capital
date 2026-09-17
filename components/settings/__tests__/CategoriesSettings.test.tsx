import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  DEFAULT_SPECIAL_CATEGORY_LABELS,
  DEFAULT_TOPICS,
  KEEP_DEFAULT_TOPICS_ADVICE,
  activeTopics,
  createDefaultTopics,
  type BudgetSettings,
} from '@/lib/budget';
import { ConfirmProvider } from '@/components/ui/ConfirmSheet';
import { ToastProvider } from '@/components/ui/Toast';
import { CategoriesSettings } from '../CategoriesSettings';

const settingsState: { settings: BudgetSettings; saveSettings: ReturnType<typeof vi.fn> } = {
  settings: { topics: [], specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS },
  saveSettings: vi.fn(),
};

vi.mock('@/components/providers/SettingsProvider', () => ({
  useSettings: () => settingsState,
}));

function renderSettings(settings: Partial<BudgetSettings> = {}) {
  settingsState.settings = {
    topics: createDefaultTopics(),
    specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS,
    modules: { expenses: true, budget: true },
    ...settings,
  };
  settingsState.saveSettings = vi.fn().mockResolvedValue(undefined);
  render(
    <ToastProvider>
      <ConfirmProvider>
        <CategoriesSettings withTargets />
      </ConfirmProvider>
    </ToastProvider>,
  );
  return settingsState;
}

const savedTopics = (state: typeof settingsState) =>
  (state.saveSettings.mock.calls[0][0] as BudgetSettings).topics;

describe('CategoriesSettings', () => {
  it('mostra para que serve cada categoria e não tem como excluir', () => {
    renderSettings();
    for (const preset of DEFAULT_TOPICS) {
      expect(screen.getByDisplayValue(preset.description)).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(KEEP_DEFAULT_TOPICS_ADVICE).length).toBeGreaterThan(0);
  });

  it('arquiva (com confirmação), esconde da lista e mantém a categoria no que é salvo', async () => {
    const state = renderSettings();
    const metas = state.settings.topics.find((t) => t.preset === 'metas')!;

    fireEvent.click(screen.getAllByRole('button', { name: 'Arquivar' })[2]);
    const dialog = await screen.findByRole('dialog', { name: 'Arquivar categoria' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Arquivar' }));
    await waitFor(() => expect(screen.queryByDisplayValue('Metas')).not.toBeInTheDocument());

    // The other three now need to add up to 100% again.
    fireEvent.change(screen.getByLabelText('Percentual de Investimentos', { selector: 'input' }), {
      target: { value: '70' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar categorias' }));

    await waitFor(() => expect(state.saveSettings).toHaveBeenCalledTimes(1));
    const topics = savedTopics(state);
    expect(topics).toHaveLength(4);
    expect(topics.find((t) => t.id === metas.id)).toMatchObject({ archived: true });
  });

  it('avisa que o padrão costuma bastar antes de criar uma categoria', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar categoria' }));
    const dialog = await screen.findByRole('dialog', { name: /criar uma categoria nova/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Manter como está' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByPlaceholderText('Nome da categoria')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar categoria' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: /criar uma categoria nova/i })).getByRole('button', {
        name: 'Criar mesmo assim',
      }),
    );
    await waitFor(() => expect(screen.getAllByPlaceholderText('Nome da categoria')).toHaveLength(5));
    expect(screen.getAllByPlaceholderText('Nome da categoria').at(-1)).toHaveValue('');
    expect(screen.getAllByPlaceholderText('Para que serve esta categoria?').at(-1)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Desistir' })).toBeInTheDocument();
  });

  it('restaura as categorias padrão arquivando as criadas', async () => {
    const defaults = createDefaultTopics();
    const state = renderSettings({
      topics: [
        { ...defaults[0], targetPct: 0.1 },
        defaults[1],
        defaults[2],
        defaults[3],
        { id: 'minha', name: 'Pets', description: 'Ração', targetPct: 0.1, order: 4 },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar categorias padrão' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: /restaurar categorias padrão/i })).getByRole(
        'button',
        {
          name: 'Restaurar',
        },
      ),
    );

    await waitFor(() => expect(state.saveSettings).toHaveBeenCalledTimes(1));
    const topics = savedTopics(state);
    expect(activeTopics(topics).map((t) => t.name)).toEqual(DEFAULT_TOPICS.map((t) => t.name));
    expect(topics.find((t) => t.id === 'minha')).toMatchObject({ archived: true });
  });
});
