import { createId } from './id';
import type { BudgetSettings, Month, MonthData, TopicConfig } from './types';

/** Default envelopes, mirroring the original spreadsheet. */
export function createDefaultTopics(): TopicConfig[] {
  return [
    { id: createId(), name: 'Diversos', targetPct: 0.2, order: 0 },
    { id: createId(), name: 'Liberdade Financeira', targetPct: 0.45, order: 1 },
    { id: createId(), name: 'Metas', targetPct: 0.25, order: 2 },
    { id: createId(), name: 'Conhecimento', targetPct: 0.1, order: 3 },
  ];
}

export function createDefaultSettings(): BudgetSettings {
  return {
    topics: createDefaultTopics(),
    specialCategories: {
      fixedCost: 'Custo Fixo',
      unforeseen: 'Imprevistos',
      reimbursed: 'Ressarcido',
    },
  };
}

/** Demo data for the first run, per the product spec's seed scenario. */
export function createSeedMonthData(month: Month, topics: TopicConfig[]): MonthData {
  const diversos = topics.find((t) => t.name === 'Diversos');
  const conhecimento = topics.find((t) => t.name === 'Conhecimento');

  return {
    month,
    incomes: [{ id: createId(), source: 'Salário', amount: 5000, date: `${month}-05` }],
    expenses: [
      {
        id: createId(),
        categoryKind: 'topic',
        topicId: diversos?.id,
        description: 'Almoço shopping',
        amount: 144.8,
        date: `${month}-03`,
      },
      {
        id: createId(),
        categoryKind: 'topic',
        topicId: conhecimento?.id,
        description: 'Cloud AI',
        amount: 110,
        date: `${month}-04`,
      },
      {
        id: createId(),
        categoryKind: 'fixedCost',
        description: 'Gasolina',
        amount: 30,
        date: `${month}-02`,
      },
      {
        id: createId(),
        categoryKind: 'fixedCost',
        description: 'Faculdade',
        amount: 872.36,
        date: `${month}-05`,
      },
      {
        id: createId(),
        categoryKind: 'unforeseen',
        description: 'Estacionamento',
        amount: 9.95,
        date: `${month}-06`,
      },
    ],
    carryIn: Object.fromEntries(topics.map((t) => [t.id, 0])),
    topicsSnapshot: topics,
  };
}
