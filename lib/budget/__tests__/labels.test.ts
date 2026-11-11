import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPECIAL_CATEGORY_LABELS,
  resolveSpecialCategoryLabels,
  specialCategoryLabel,
} from '../categories';
import { greetingFor, greetingLine } from '../greeting';

describe('rótulos das categorias especiais', () => {
  it('chama a categoria do bot de "Reembolso", nunca de "Ressarcido"', () => {
    expect(DEFAULT_SPECIAL_CATEGORY_LABELS.reimbursable).toBe('Reembolso');
    expect(JSON.stringify(DEFAULT_SPECIAL_CATEGORY_LABELS).toLowerCase()).not.toContain('ressarcido');
  });

  it('completa o rótulo que falta em dados antigos', () => {
    const labels = resolveSpecialCategoryLabels({ fixedCost: 'Fixos', unforeseen: 'Imprevistos' });
    expect(labels).toEqual({
      fixedCost: 'Fixos',
      unforeseen: 'Imprevistos',
      reimbursable: 'Reembolso',
      uncounted: 'Fora do orçamento',
    });
  });

  it('mostra "Reembolso" numa conta que guardou o nome antigo "A receber"', () => {
    for (const stored of ['A receber', ' a receber ']) {
      expect(
        resolveSpecialCategoryLabels({ fixedCost: 'F', unforeseen: 'U', reimbursable: stored }).reimbursable,
      ).toBe('Reembolso');
    }
    expect(
      specialCategoryLabel('reimbursable', { fixedCost: 'F', unforeseen: 'U', reimbursable: 'A receber' }),
    ).toBe('Reembolso');
    // A name the person chose is not a former default: it stays.
    expect(
      resolveSpecialCategoryLabels({ fixedCost: 'F', unforeseen: 'U', reimbursable: 'Me devem' }),
    ).toMatchObject({
      fixedCost: 'F',
      reimbursable: 'Me devem',
    });
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
