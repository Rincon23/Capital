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
  VIP_ONLY_MODULES,
  withAccessRules,
} from '../flags';

const on = (...keys: ModuleKey[]) => Object.fromEntries(keys.map((key) => [key, true]));

describe('catálogo de módulos', () => {
  it('tem os 11 módulos, cada um depois dos que ele precisa', () => {
    expect(MODULE_KEYS).toEqual([
      'expenses',
      'budget',
      'card',
      'reimbursable',
      'history',
      'recurring',
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
    expect(missingDependencies({}, 'reimbursable')).toEqual(['card']);
    expect(missingDependencies({ modules: on('expenses') }, 'card')).toEqual([]);
    expect(missingDependencies({}, 'card')).toEqual(['expenses']);
    expect(missingDependencies({}, 'history')).toEqual(['budget']);
    expect(missingDependencies({}, 'reminders')).toEqual([]);
  });

  it('mostra o bloqueio mais próximo e a ordem do que ligar antes', () => {
    expect(nearestMissing({}, 'reimbursable')).toEqual(['card']);
    expect(modulesToTurnOnFirst({}, 'reimbursable')).toEqual(['expenses', 'card']);
    expect(modulesToTurnOnFirst({}, 'history')).toEqual(['expenses', 'budget']);
    expect(modulesToTurnOnFirst({ modules: on('expenses') }, 'history')).toEqual(['budget']);
    expect(nearestMissing({ modules: on('expenses', 'card') }, 'reimbursable')).toEqual([]);
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
      'investments',
      'voice',
    ]);
    expect(dependentsOf('card')).toEqual(['reimbursable']);
    expect(dependentsOf('budget')).toEqual(['history']);
    expect(dependentsOf('gmail')).toEqual([]);
  });

  it('desligar o pai desliga junto os filhos que estavam ligados, e só eles', () => {
    const settings = { modules: on('expenses', 'card', 'reimbursable', 'reminders') };
    const { modules, alsoOff } = turnModuleOff(settings, 'card');
    expect(alsoOff).toEqual(['reimbursable']);
    expect(modules.card).toBe(false);
    expect(modules.reimbursable).toBe(false);
    expect(modules.expenses).toBe(true);
    expect(modules.reminders).toBe(true);
  });

  it('monta a árvore com cada módulo embaixo de quem ele precisa', () => {
    expect(parentOf('reimbursable')).toBe('card');
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
    expect(card?.children.map((node) => node.key)).toEqual(['reimbursable']);
  });
});

describe('withAccessRules', () => {
  it('keeps Lançar por voz off for accounts that are not VIP, whatever was saved', () => {
    expect(VIP_ONLY_MODULES).toEqual(['voice']);
    const saved = { modules: on('expenses', 'voice') };
    expect(withAccessRules(saved, false).modules).toEqual({ expenses: true, voice: false });
    expect(isModuleOn(withAccessRules(saved, false), 'voice')).toBe(false);
  });

  it('leaves a VIP account as it is', () => {
    const saved = { modules: on('expenses', 'voice') };
    expect(withAccessRules(saved, true)).toBe(saved);
    expect(isModuleOn(withAccessRules(saved, true), 'voice')).toBe(true);
  });

  it('does not add a modules map to a payload that had none', () => {
    const saved = { modules: undefined };
    expect(withAccessRules(saved, false)).toBe(saved);
  });
});
