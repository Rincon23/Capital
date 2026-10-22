import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEFAULT_SPECIAL_CATEGORY_LABELS, type BudgetSettings, type ModuleKey } from '@/lib/budget';
import { ModuleGate } from '../ModuleGate';

/** Who is looking: an account without access, and the modules the owner made "Restrito". */
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

describe('ModuleGate e os módulos restritos da Administração', () => {
  it('para quem não tem acesso, o módulo restrito não existe: nem nome, nem botão de ligar', () => {
    renderGate('gmail', { vip: false, vipModules: ['gmail'] });
    expect(screen.getByText('Página não encontrada')).toBeInTheDocument();
    expect(screen.queryByText(/Gmail/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VIP|Restrito/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ligar/ })).not.toBeInTheDocument();
  });

  it('esconde também o que depende de um módulo restrito', () => {
    renderGate('history', { vip: false, vipModules: ['expenses'] });
    expect(screen.getByText('Página não encontrada')).toBeInTheDocument();
    expect(screen.queryByText(/Lançamentos|Histórico/)).not.toBeInTheDocument();
  });

  it('um módulo que deixou de ser restrito pode ser ligado por qualquer conta', () => {
    renderGate('banks', { vip: false, vipModules: ['voice'] });
    expect(screen.getByRole('button', { name: 'Ligar Open Finance' })).toBeInTheDocument();
  });

  it('a conta com acesso liga mesmo o que é restrito', () => {
    renderGate('banks', { vip: true, vipModules: ['banks', 'voice'] });
    expect(screen.getByRole('button', { name: 'Ligar Open Finance' })).toBeInTheDocument();
  });
});
