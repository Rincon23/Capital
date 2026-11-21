// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HttpError } from '../httpError';
import { assertMonthOver, assertMonthsBeforeOver, latestCurrentMonth } from '../monthEnd';

/** The middle of November, and the last hours of it in Brazil (already December further east). */
const MID_NOVEMBER = new Date('2026-11-16T15:00:00Z');
const LAST_EVENING = new Date('2026-11-30T23:30:00Z');

describe('fechar o mês só depois que ele acaba', () => {
  it('recusa o mês em curso e os que ainda vêm, com uma frase que diz o porquê', () => {
    for (const month of ['2026-11', '2026-12', '2027-03']) {
      expect(() => assertMonthOver(month, MID_NOVEMBER)).toThrow(HttpError);
    }
    try {
      assertMonthOver('2026-11', MID_NOVEMBER);
    } catch (error) {
      expect(error).toMatchObject({
        status: 409,
        code: 'MONTH_NOT_OVER',
        message: 'Novembro ainda não acabou. Você fecha o mês quando ele terminar.',
      });
    }
  });

  it('aceita qualquer mês que já acabou', () => {
    for (const month of ['2026-10', '2026-01', '2025-12']) {
      expect(() => assertMonthOver(month, MID_NOVEMBER)).not.toThrow();
    }
  });

  it('não segura o mês de quem já virou o dia antes do servidor', () => {
    expect(latestCurrentMonth(MID_NOVEMBER)).toBe('2026-11');
    expect(latestCurrentMonth(LAST_EVENING)).toBe('2026-12');
    expect(() => assertMonthOver('2026-11', LAST_EVENING)).not.toThrow();
    expect(() => assertMonthOver('2026-12', LAST_EVENING)).toThrow(HttpError);
  });

  it('"fechar os anteriores" vai até o mês de hoje, nunca além', () => {
    expect(() => assertMonthsBeforeOver('2026-11', MID_NOVEMBER)).not.toThrow();
    expect(() => assertMonthsBeforeOver('2026-06', MID_NOVEMBER)).not.toThrow();
    expect(() => assertMonthsBeforeOver('2026-12', MID_NOVEMBER)).toThrow(HttpError);
  });
});
