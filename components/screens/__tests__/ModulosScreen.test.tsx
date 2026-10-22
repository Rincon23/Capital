import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEFAULT_SPECIAL_CATEGORY_LABELS, type BudgetSettings, type ModuleKey } from '@/lib/budget';
import { ModulosScreen } from '../ModulosScreen';

/** Who is looking, and the modules the owner made "Restrito" in Administração. */
const auth = { user: { vip: false, vipModules: [] as ModuleKey[] } };
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth }));

const settings: BudgetSettings = { topics: [], specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS, modules: {} };
vi.mock('@/components/providers/SettingsProvider', () => ({ useSettings: () => ({ settings }) }));
vi.mock('@/components/modules/useModuleSwitch', () => ({
  useModuleSwitch: () => ({ turnOn: vi.fn(), turnOnWithParents: vi.fn(), turnOff: vi.fn(), busy: false }),
  turnOnTogetherLabel: (count: number) => `Ligar os ${count}`,
}));
vi.mock('@/components/ui/ConfirmSheet', () => ({ useConfirm: () => vi.fn() }));

function renderScreen(access: { vip: boolean; vipModules: ModuleKey[] }) {
  auth.user = access;
  render(<ModulosScreen />);
}

describe('Módulos e os módulos restritos', () => {
  it('quem não tem acesso não vê o módulo restrito nem nenhuma marca dele', () => {
    renderScreen({ vip: false, vipModules: ['banks', 'voice'] });
    expect(screen.queryByText('Open Finance')).not.toBeInTheDocument();
    expect(screen.queryByText('Lançar por voz ou texto')).not.toBeInTheDocument();
    expect(screen.queryByText(/VIP|Restrito/)).not.toBeInTheDocument();
    expect(screen.getByText('Monitor de Gmail')).toBeInTheDocument();
  });

  it('some também o que depende de um restrito, e o grupo que ficou vazio', () => {
    renderScreen({ vip: false, vipModules: ['diagram'] });
    expect(screen.queryByText('Diagrama')).not.toBeInTheDocument();
    expect(screen.queryByText('Investimentos')).not.toBeInTheDocument();
  });

  it('quem tem acesso vê o módulo, marcado "Restrito"', () => {
    renderScreen({ vip: true, vipModules: ['banks', 'voice'] });
    expect(screen.getByText('Open Finance')).toBeInTheDocument();
    expect(screen.getAllByText('Restrito')).toHaveLength(2);
  });
});
