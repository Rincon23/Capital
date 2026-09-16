import { describe, expect, it } from 'vitest';
import { DEFAULT_SPECIAL_CATEGORY_LABELS, resolveSpecialCategoryLabels, specialCategoryLabel } from '../categories';
import { greetingFor, greetingLine } from '../greeting';
import { MODULE_CATALOG, isModuleOn, resolveModules } from '../modules';
import { createDefaultSettings } from '../seed';
import type { BudgetSettings } from '../types';

describe('módulos', () => {
  it('deixa tudo desligado quando a conta nunca abriu a tela de Módulos', () => {
    expect(Object.values(resolveModules(undefined)).every((on) => on === false)).toBe(true);
    expect(Object.values(resolveModules({ modules: undefined })).every((on) => on === false)).toBe(true);
    expect(Object.values(resolveModules(createDefaultSettings())).every((on) => on === false)).toBe(true);
  });

  it('liga só o que foi gravado, mantendo o resto desligado', () => {
    const settings = { modules: { reimbursable: true } } as Pick<BudgetSettings, 'modules'>;
    expect(isModuleOn(settings, 'reimbursable')).toBe(true);
    expect(isModuleOn(settings, 'reminders')).toBe(false);
    expect(isModuleOn(null, 'reimbursable')).toBe(false);
  });

  it('só oferece para ligar o que já existe no app', () => {
    expect(MODULE_CATALOG.filter((info) => info.available).map((info) => info.key)).toEqual([
      'reimbursable',
    ]);
  });
});

describe('rótulos das categorias especiais', () => {
  it('chama a categoria do bot de "A receber", nunca de "Ressarcido"', () => {
    expect(DEFAULT_SPECIAL_CATEGORY_LABELS.reimbursable).toBe('A receber');
    expect(JSON.stringify(DEFAULT_SPECIAL_CATEGORY_LABELS).toLowerCase()).not.toContain('ressarcido');
  });

  it('completa o rótulo que falta em dados antigos', () => {
    const labels = resolveSpecialCategoryLabels({ fixedCost: 'Fixos', unforeseen: 'Imprevistos' });
    expect(labels).toEqual({ fixedCost: 'Fixos', unforeseen: 'Imprevistos', reimbursable: 'A receber' });
  });

  it('respeita o rótulo renomeado pelo usuário', () => {
    const labels = { fixedCost: 'F', unforeseen: 'U', reimbursable: 'Me devem' };
    expect(specialCategoryLabel('reimbursable', labels)).toBe('Me devem');
    expect(specialCategoryLabel('topic', labels)).toBe('');
  });
});

describe('saudação por horário', () => {
  const at = (hour: number) => new Date(2026, 8, 16, hour, 0, 0);

  it.each([
    [4, 'Boa noite'],
    [5, 'Bom dia'],
    [11, 'Bom dia'],
    [12, 'Boa tarde'],
    [17, 'Boa tarde'],
    [18, 'Boa noite'],
    [23, 'Boa noite'],
  ])('às %ih diz "%s"', (hour, expected) => {
    expect(greetingFor(at(hour)).text).toBe(expected);
  });

  it('usa o primeiro nome quando existe', () => {
    expect(greetingLine('Enzo Rincon', at(9))).toBe('Bom dia, Enzo');
    expect(greetingLine(null, at(20))).toBe('Boa noite');
    expect(greetingLine('  ', at(13))).toBe('Boa tarde');
  });
});
