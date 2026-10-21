import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEFAULT_SPECIAL_CATEGORY_LABELS, type BudgetSettings, type ModuleKey } from '@/lib/budget';
import { ModuleGate } from '../ModuleGate';

/** Who is looking: an account without VIP, and the modules the owner made "Só VIP". */
const auth = { user: { vip: false, vipModules: [] as ModuleKey[] } };
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth }));

const settings: BudgetSettings = { topics: [], specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS, modules: {} };
vi.mock('@/components/providers/SettingsProvider', () => ({
  useSettings: () => ({ settings, loading: false }),
}));
vi.mock('../useModuleSwitch', () => ({
  useModuleSwitch: () => ({ turnOn: vi.fn(), turnOnWithParents: vi.fn(), busy: false }),
  turnOnTogetherLabel: (count: number) => `Ligar os ${count}`,
}));

function renderGate(module: ModuleKey, access: { vip: boolean; vipModules: ModuleKey[] }) {
  auth.user = access;
  render(
    <ModuleGate module={module}>
      <p>tela do módulo</p>
    </ModuleGate>,
  );
}

describe('ModuleGate e o "Só VIP" da Administração', () => {
  it('mostra o selo VIP, sem botão de ligar, a quem não é VIP', () => {
    renderGate('gmail', { vip: false, vipModules: ['gmail'] });
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Disponível só para contas VIP.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ligar/ })).not.toBeInTheDocument();
  });

  it('tranca também o que depende de um módulo só VIP', () => {
    renderGate('history', { vip: false, vipModules: ['expenses'] });
    expect(screen.getByText('Precisa de Lançamentos, disponível só para contas VIP.')).toBeInTheDocument();
  });

  it('um módulo que deixou de ser VIP pode ser ligado por qualquer conta', () => {
    renderGate('banks', { vip: false, vipModules: ['voice'] });
    expect(screen.getByRole('button', { name: 'Ligar Open Finance' })).toBeInTheDocument();
    expect(screen.queryByText('VIP')).not.toBeInTheDocument();
  });

  it('a conta VIP liga mesmo o que é "Só VIP"', () => {
    renderGate('banks', { vip: true, vipModules: ['banks', 'voice'] });
    expect(screen.getByRole('button', { name: 'Ligar Open Finance' })).toBeInTheDocument();
  });
});
