import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../../budget/seed';
import type { ModuleKey } from '../../budget/types';
import { MODULES, MODULE_KEYS, moduleNames } from '../catalog';
import {
  DEFAULT_VIP_MODULES,
  dependentsOf,
  isModuleHidden,
  isModuleOn,
  mayUseModule,
  missingDependencies,
  moduleTree,
  modulesToTurnOnFirst,
  nearestMissing,
  parentOf,
  resolveModules,
  storedModules,
  turnModuleOff,
  turnModuleOn,
  turnModulesOn,
  vipLockOf,
  vipModulesFrom,
  withAccessRules,
} from '../flags';

const on = (...keys: ModuleKey[]) => Object.fromEntries(keys.map((key) => [key, true]));
const notVipDefault = { vip: false, vipModules: DEFAULT_VIP_MODULES };

describe('catálogo de módulos', () => {
  it('tem os 12 módulos, cada um depois dos que ele precisa', () => {
    expect(MODULE_KEYS).toEqual([
      'expenses',
      'budget',
      'card',
      'reimbursable',
      'history',
      'recurring',
      'cash',
      'banks',
      'diagram',
      'reminders',
      'voice',
      'gmail',
    ]);
    MODULES.forEach((definition, index) => {
      for (const dep of definition.dependsOn) expect(MODULE_KEYS.indexOf(dep)).toBeLessThan(index);
    });
  });

  it('junta nomes de módulos em português', () => {
    expect(moduleNames(['expenses'])).toBe('Lançamentos');
    expect(moduleNames(['expenses', 'card'])).toBe('Lançamentos e Cartão');
    expect(moduleNames(['expenses', 'card', 'reimbursable'])).toBe(
      'Lançamentos, Cartão e A receber',
    );
  });

  it('nunca chama nada de "Ressarcido" nem de "balde"', () => {
    const text = JSON.stringify(MODULES).toLowerCase();
    expect(text).not.toContain('ressarcido');
    expect(text).not.toContain('balde');
  });
});

describe('módulos ligados', () => {
  it('deixa tudo desligado para uma conta nova', () => {
    expect(Object.values(resolveModules(undefined)).every((value) => value === false)).toBe(true);
    expect(Object.values(resolveModules(createDefaultSettings())).every((value) => value === false)).toBe(
      true,
    );
  });

  it('liga só o que foi gravado', () => {
    const settings = { modules: on('expenses', 'reminders') };
    expect(isModuleOn(settings, 'expenses')).toBe(true);
    expect(isModuleOn(settings, 'reminders')).toBe(true);
    expect(isModuleOn(settings, 'budget')).toBe(false);
    expect(isModuleOn(null, 'expenses')).toBe(false);
  });

  it('não conta como ligado um módulo cujo pai está desligado, mesmo que tenha sido gravado', () => {
    const settings = { modules: on('history', 'card', 'voice', 'budget') };
    expect(storedModules(settings).history).toBe(true);
    // Sem Lançamentos, nada que dependa dele funciona.
    expect(isModuleOn(settings, 'budget')).toBe(false);
    expect(isModuleOn(settings, 'history')).toBe(false);
    expect(isModuleOn(settings, 'card')).toBe(false);
    expect(isModuleOn(settings, 'voice')).toBe(false);
  });

  it('ignora uma chave que não existe mais (um módulo que foi fundido em outro)', () => {
    const settings = { modules: { expenses: true, cards: true } as Record<string, boolean> };
    expect(storedModules(settings).expenses).toBe(true);
    expect(Object.keys(storedModules(settings))).not.toContain('cards');
  });
});

describe('dependências', () => {
  it('diz o que falta ligar antes', () => {
    expect(missingDependencies({}, 'reimbursable')).toEqual(['expenses']);
    expect(missingDependencies({ modules: on('expenses') }, 'card')).toEqual([]);
    expect(missingDependencies({}, 'card')).toEqual(['expenses']);
    expect(missingDependencies({}, 'history')).toEqual(['budget']);
    expect(missingDependencies({}, 'reminders')).toEqual([]);
  });

  it('mostra o bloqueio mais próximo e a ordem do que ligar antes', () => {
    expect(nearestMissing({}, 'history')).toEqual(['budget']);
    expect(modulesToTurnOnFirst({}, 'history')).toEqual(['expenses', 'budget']);
    expect(modulesToTurnOnFirst({ modules: on('expenses') }, 'history')).toEqual(['budget']);
    expect(nearestMissing({ modules: on('expenses', 'budget') }, 'history')).toEqual([]);
    // A receber is not only for the card: lending money in cash is the same thing.
    expect(modulesToTurnOnFirst({}, 'reimbursable')).toEqual(['expenses']);
  });

  it('não liga o filho com o pai desligado, e nunca liga o pai sozinho', () => {
    const result = turnModuleOn({ modules: on('expenses') }, 'history');
    expect(result).toEqual({ ok: false, missing: ['budget'] });

    const allowed = turnModuleOn({ modules: on('expenses', 'budget') }, 'history');
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.modules.history).toBe(true);
      expect(allowed.modules.card).toBe(false);
    }
  });

  it('liga um conjunto escolhido de uma vez, pai junto com o filho, e nada se faltar alguém de fora', () => {
    const kit = turnModulesOn({}, ['expenses', 'budget', 'card']);
    expect(kit.ok).toBe(true);
    if (kit.ok) {
      expect(MODULE_KEYS.filter((key) => kit.modules[key])).toEqual(['expenses', 'budget', 'card']);
    }

    // Keeps what was already on.
    const more = turnModulesOn({ modules: on('reminders') }, ['expenses', 'budget']);
    expect(more.ok && MODULE_KEYS.filter((key) => more.modules[key])).toEqual(['expenses', 'budget', 'reminders']);

    // History needs Gastos por categoria, which is neither on nor in the set.
    expect(turnModulesOn({}, ['expenses', 'history'])).toEqual({ ok: false, missing: ['budget'] });
  });

  it('lista quem depende de um módulo, direta ou indiretamente', () => {
    expect(dependentsOf('expenses')).toEqual([
      'budget',
      'card',
      'reimbursable',
      'history',
      'recurring',
      'voice',
    ]);
    expect(dependentsOf('card')).toEqual([]);
    expect(dependentsOf('budget')).toEqual(['history']);
    expect(dependentsOf('gmail')).toEqual([]);
  });

  it('desligar o pai desliga junto os filhos que estavam ligados, e só eles', () => {
    const settings = { modules: on('expenses', 'budget', 'history', 'card', 'reminders') };
    const { modules, alsoOff } = turnModuleOff(settings, 'budget');
    expect(alsoOff).toEqual(['history']);
    expect(modules.budget).toBe(false);
    expect(modules.history).toBe(false);
    expect(modules.card).toBe(true);
    expect(modules.reminders).toBe(true);
  });

  it('monta a árvore com cada módulo embaixo de quem ele precisa', () => {
    expect(parentOf('reimbursable')).toBe('expenses');
    expect(parentOf('history')).toBe('budget');
    expect(parentOf('cash')).toBeNull();

    const tree = moduleTree();
    expect(tree.map((node) => node.key)).toEqual(['expenses', 'cash', 'banks', 'diagram', 'reminders', 'gmail']);
    const expenses = tree[0];
    expect(expenses.children.map((node) => node.key)).toEqual([
      'budget',
      'card',
      'reimbursable',
      'recurring',
      'voice',
    ]);
    const budget = expenses.children.find((node) => node.key === 'budget');
    expect(budget?.children.map((node) => node.key)).toEqual(['history']);
  });
});

describe('módulos só para VIP', () => {
  const notVip = (...vipModules: ModuleKey[]) => ({ vip: false, vipModules });

  it('começa com Open Finance e Lançar por voz ou texto só para VIP', () => {
    expect(DEFAULT_VIP_MODULES).toEqual(['banks', 'voice']);
    expect(vipModulesFrom({})).toEqual(['banks', 'voice']);
  });

  it('segue a escolha do dono em Administração, módulo por módulo', () => {
    expect(vipModulesFrom({ banks: false })).toEqual(['voice']);
    expect(vipModulesFrom({ gmail: true, voice: false })).toEqual(['banks', 'gmail']);
    expect(vipModulesFrom({ banks: false, voice: false })).toEqual([]);
  });

  it('libera tudo para VIP e só o que não é "Só VIP" para os outros', () => {
    expect(mayUseModule({ vip: true, vipModules: ['banks'] }, 'banks')).toBe(true);
    expect(mayUseModule(notVip('banks'), 'banks')).toBe(false);
    expect(mayUseModule(notVip('banks'), 'gmail')).toBe(true);
    expect(mayUseModule(notVip(), 'banks')).toBe(true);
  });

  it('tranca também o que depende de um módulo só VIP', () => {
    expect(vipLockOf(notVip('expenses'), 'expenses')).toBe('expenses');
    expect(vipLockOf(notVip('expenses'), 'history')).toBe('expenses');
    expect(vipLockOf(notVip('expenses'), 'cash')).toBeNull();
    expect(vipLockOf({ vip: true, vipModules: ['expenses'] }, 'history')).toBeNull();
  });

  it('esconde o módulo restrito e o que depende dele de quem não tem acesso', () => {
    expect(isModuleHidden(notVip('expenses'), 'expenses')).toBe(true);
    expect(isModuleHidden(notVip('expenses'), 'history')).toBe(true);
    expect(isModuleHidden(notVip('expenses'), 'cash')).toBe(false);
    expect(isModuleHidden({ vip: true, vipModules: ['expenses'] }, 'history')).toBe(false);
  });
});

describe('withAccessRules', () => {
  it('keeps the VIP modules off for accounts that are not VIP, whatever was saved', () => {
    const saved = { modules: on('expenses', 'voice') };
    expect(withAccessRules(saved, notVipDefault).modules).toEqual({ expenses: true, voice: false });
    expect(isModuleOn(withAccessRules(saved, notVipDefault), 'voice')).toBe(false);
  });

  it('follows the saved choice: a module no longer VIP stays as it was saved', () => {
    const saved = { modules: on('expenses', 'voice', 'gmail') };
    expect(withAccessRules(saved, { vip: false, vipModules: ['gmail'] }).modules).toEqual({
      expenses: true,
      voice: true,
      gmail: false,
    });
  });

  it('leaves a VIP account as it is', () => {
    const saved = { modules: on('expenses', 'voice') };
    expect(withAccessRules(saved, { vip: true, vipModules: DEFAULT_VIP_MODULES })).toBe(saved);
    expect(isModuleOn(withAccessRules(saved, { vip: true, vipModules: DEFAULT_VIP_MODULES }), 'voice')).toBe(true);
  });

  it('does not add a modules map to a payload that had none', () => {
    const saved = { modules: undefined };
    expect(withAccessRules(saved, notVipDefault)).toBe(saved);
  });
});
