import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../../budget/seed';
import type { ModuleKey } from '../../budget/types';
import { MODULES, MODULE_KEYS, moduleNames } from '../catalog';
import {
  dependentsOf,
  isModuleOn,
  missingDependencies,
  moduleTree,
  modulesToTurnOnFirst,
  nearestMissing,
  parentOf,
  resolveModules,
  storedModules,
  turnModuleOff,
  turnModuleOn,
} from '../flags';

const on = (...keys: ModuleKey[]) => Object.fromEntries(keys.map((key) => [key, true]));

describe('catálogo de módulos', () => {
  it('tem os 12 módulos, cada um depois dos que ele precisa', () => {
    expect(MODULE_KEYS).toEqual([
      'expenses',
      'budget',
      'card',
      'reimbursable',
      'history',
      'recurring',
      'installments',
      'investments',
      'cash',
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
    expect(moduleNames(['expenses', 'card'])).toBe('Lançamentos e Cartão de crédito');
    expect(moduleNames(['expenses', 'card', 'installments'])).toBe(
      'Lançamentos, Cartão de crédito e Parcelados',
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
    const settings = { modules: on('history', 'installments', 'voice', 'budget') };
    expect(storedModules(settings).history).toBe(true);
    // Sem Lançamentos, nada que dependa dele funciona.
    expect(isModuleOn(settings, 'budget')).toBe(false);
    expect(isModuleOn(settings, 'history')).toBe(false);
    expect(isModuleOn(settings, 'installments')).toBe(false);
    expect(isModuleOn(settings, 'voice')).toBe(false);
  });
});

describe('dependências', () => {
  it('diz o que falta ligar antes', () => {
    expect(missingDependencies({}, 'installments')).toEqual(['expenses', 'card']);
    expect(missingDependencies({ modules: on('expenses') }, 'installments')).toEqual(['card']);
    expect(missingDependencies({ modules: on('expenses', 'card') }, 'installments')).toEqual([]);
    expect(missingDependencies({}, 'history')).toEqual(['budget']);
    expect(missingDependencies({}, 'reminders')).toEqual([]);
  });

  it('mostra o bloqueio mais próximo e a ordem do que ligar antes', () => {
    expect(nearestMissing({}, 'installments')).toEqual(['card']);
    expect(modulesToTurnOnFirst({}, 'installments')).toEqual(['expenses', 'card']);
    expect(modulesToTurnOnFirst({}, 'history')).toEqual(['expenses', 'budget']);
    expect(modulesToTurnOnFirst({ modules: on('expenses') }, 'history')).toEqual(['budget']);
    expect(nearestMissing({ modules: on('expenses', 'card') }, 'installments')).toEqual([]);
  });

  it('não liga o filho com o pai desligado, e nunca liga o pai sozinho', () => {
    const result = turnModuleOn({ modules: on('expenses') }, 'reimbursable');
    expect(result).toEqual({ ok: false, missing: ['card'] });

    const allowed = turnModuleOn({ modules: on('expenses', 'card') }, 'reimbursable');
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.modules.reimbursable).toBe(true);
      expect(allowed.modules.budget).toBe(false);
    }
  });

  it('lista quem depende de um módulo, direta ou indiretamente', () => {
    expect(dependentsOf('expenses')).toEqual([
      'budget',
      'card',
      'reimbursable',
      'history',
      'recurring',
      'installments',
      'investments',
      'voice',
    ]);
    expect(dependentsOf('card')).toEqual(['reimbursable', 'installments']);
    expect(dependentsOf('budget')).toEqual(['history']);
    expect(dependentsOf('gmail')).toEqual([]);
  });

  it('desligar o pai desliga junto os filhos que estavam ligados, e só eles', () => {
    const settings = { modules: on('expenses', 'card', 'installments', 'reminders') };
    const { modules, alsoOff } = turnModuleOff(settings, 'card');
    expect(alsoOff).toEqual(['installments']);
    expect(modules.card).toBe(false);
    expect(modules.installments).toBe(false);
    expect(modules.expenses).toBe(true);
    expect(modules.reminders).toBe(true);
  });

  it('monta a árvore com cada módulo embaixo de quem ele precisa', () => {
    expect(parentOf('installments')).toBe('card');
    expect(parentOf('history')).toBe('budget');
    expect(parentOf('cash')).toBeNull();

    const tree = moduleTree();
    expect(tree.map((node) => node.key)).toEqual(['expenses', 'cash', 'reminders', 'gmail']);
    const expenses = tree[0];
    expect(expenses.children.map((node) => node.key)).toEqual([
      'budget',
      'card',
      'recurring',
      'investments',
      'voice',
    ]);
    const card = expenses.children.find((node) => node.key === 'card');
    expect(card?.children.map((node) => node.key)).toEqual(['reimbursable', 'installments']);
  });
});
