import { describe, expect, it } from 'vitest';
import { formatMonthLabel, nextMonth, previousMonth, shiftMonth } from '../date';

describe('date utils', () => {
  it('avança de dezembro para janeiro do ano seguinte', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('volta de janeiro para dezembro do ano anterior', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('desloca múltiplos meses', () => {
    expect(shiftMonth('2026-09', 5)).toBe('2027-02');
    expect(shiftMonth('2026-09', -12)).toBe('2025-09');
  });

  it('formata o rótulo em português', () => {
    expect(formatMonthLabel('2026-09')).toBe('Setembro 2026');
  });
});
