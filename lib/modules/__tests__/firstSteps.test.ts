import { describe, expect, it } from 'vitest';
import type { Expense, Income } from '../../budget/types';
import { MODULE_KITS } from '../kits';
import { turnModulesOn } from '../flags';
import { firstStepNoticesToAdd, firstStepsDone, wantsFirstSteps } from '../firstSteps';

const income: Income = { id: 'i1', source: 'Salário', amount: 3000, date: '2026-10-01' };
const expense: Expense = {
  id: 'e1',
  categoryKind: 'topic',
  topicId: 'diversos',
  description: 'Almoço',
  amount: 45,
  date: '2026-10-02',
};

describe('kits do primeiro acesso', () => {
  it('cada kit liga os seus módulos de uma vez, numa conta sem nada ligado', () => {
    for (const kit of MODULE_KITS) expect(turnModulesOn({}, kit.modules).ok).toBe(true);
  });
});

describe('Primeiros passos', () => {
  it('existe só para a conta que passou pela escolha, até os três estarem feitos', () => {
    expect(wantsFirstSteps({})).toBe(false);
    expect(wantsFirstSteps({ dismissedNotices: ['intro:budget'] })).toBe(false);
    expect(wantsFirstSteps({ dismissedNotices: ['first-steps'] })).toBe(true);
    expect(
      wantsFirstSteps({ dismissedNotices: ['first-steps', 'first-steps:income', 'first-steps:expense'] }),
    ).toBe(true);
    expect(
      wantsFirstSteps({
        dismissedNotices: ['first-steps', 'first-steps:income', 'first-steps:expense', 'first-steps:budget'],
      }),
    ).toBe(false);
  });

  it('se marcam pelo que o mês mostra ou pelo que já foi salvo', () => {
    const notices = { dismissedNotices: ['first-steps'] };
    expect(firstStepsDone(notices, { incomes: [], expenses: [] })).toEqual({
      income: false,
      expense: false,
      budget: false,
    });
    expect(firstStepsDone(notices, { incomes: [income], expenses: [expense] })).toEqual({
      income: true,
      expense: true,
      budget: false,
    });
    // Saved before: a new month with nothing in it yet keeps them done.
    expect(
      firstStepsDone({ dismissedNotices: ['first-steps', 'first-steps:income', 'first-steps:budget'] }, null),
    ).toEqual({ income: true, expense: false, budget: true });
  });

  it('salva só os passos novos, e nada para uma conta sem Primeiros passos', () => {
    expect(firstStepNoticesToAdd({ dismissedNotices: ['first-steps'] }, ['expense', 'income'])).toEqual([
      'first-steps:income',
      'first-steps:expense',
    ]);
    expect(
      firstStepNoticesToAdd({ dismissedNotices: ['first-steps', 'first-steps:income'] }, ['income', 'budget']),
    ).toEqual(['first-steps:budget']);
    expect(firstStepNoticesToAdd({ dismissedNotices: [] }, ['income'])).toEqual([]);
  });
});
