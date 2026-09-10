import { describe, expect, it } from 'vitest';
import { amountToInputValue, formatBRL, parseAmountInput, round2 } from '../money';

describe('money utils', () => {
  it('arredonda para 2 casas evitando erro de ponto flutuante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('formata em BRL', () => {
    // Intl.NumberFormat uses a non-breaking space (U+00A0) between "R$" and the amount.
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
  });

  it('interpreta valores digitados com vírgula decimal', () => {
    expect(parseAmountInput('1.234,56')).toBe(1234.56);
    expect(parseAmountInput('144,8')).toBe(144.8);
  });

  it('interpreta valores digitados com ponto decimal', () => {
    expect(parseAmountInput('144.80')).toBe(144.8);
  });

  it('converte número para valor editável', () => {
    expect(amountToInputValue(144.8)).toBe('144,80');
  });
});
