import { describe, expect, it } from 'vitest';
import { computeMonthSummary } from '../calculations';
import { DEFAULT_TOPIC_COLORS } from '../colors';
import { currentMonthKey, nextMonth, previousMonth } from '../date';
import {
  DEFAULT_TOPICS,
  activeTopics,
  createDefaultTopics,
  hasDefaultTopics,
  keepEveryTopic,
  normalizeTopic,
  restoreDefaultTopics,
  topicDescription,
} from '../topics';
import type { Expense, MonthData, TopicConfig } from '../types';
import { validateTopicPercentages } from '../validation';

const created = (id: string, order: number, targetPct = 0.1): TopicConfig => ({
  id,
  name: `Criada ${id}`,
  description: 'Minha categoria',
  targetPct,
  order,
});

describe('categorias padrão', () => {
  it('nascem com a descrição de para que servem, fechando 100%', () => {
    const topics = createDefaultTopics();
    expect(topics.map((t) => t.name)).toEqual(['Diversos', 'Investimentos', 'Metas', 'Conhecimentos']);
    expect(topics.every((t) => t.preset && topicDescription(t).length > 0)).toBe(true);
    expect(validateTopicPercentages(topics).valid).toBe(true);
    expect(hasDefaultTopics(topics)).toBe(true);
  });

  it('explica uma categoria de dados antigos (sem preset nem descrição) pelo nome', () => {
    const legacy: TopicConfig = { id: 'x', name: 'Metas', targetPct: 0.25, order: 2 };
    expect(topicDescription(legacy)).toBe(DEFAULT_TOPICS[2].description);
    expect(normalizeTopic(legacy)).toMatchObject({
      preset: 'metas',
      description: DEFAULT_TOPICS[2].description,
    });
  });

  it('respeita a descrição escrita pela pessoa, mesmo vazia', () => {
    const [diversos] = createDefaultTopics();
    expect(topicDescription({ ...diversos, description: 'Lazer' })).toBe('Lazer');
    expect(topicDescription({ ...diversos, description: '' })).toBe('');
    expect(topicDescription(created('a', 4))).toBe('Minha categoria');
  });
});

describe('restaurar categorias padrão', () => {
  it('arquiva as criadas e devolve as quatro padrão como vieram, sem trocar o id', () => {
    const defaults = createDefaultTopics();
    const edited = [
      { ...defaults[0], name: 'Lazer', targetPct: 0.1, color: '#000000' },
      { ...defaults[1], archived: true },
      defaults[2],
      defaults[3],
      created('a', 4, 0.3),
    ];
    const restored = restoreDefaultTopics(edited);

    expect(activeTopics(restored).map((t) => t.id)).toEqual(defaults.map((t) => t.id));
    expect(hasDefaultTopics(restored)).toBe(true);
    expect(restored.find((t) => t.id === 'a')).toMatchObject({ archived: true, name: 'Criada a' });
    expect(restored).toHaveLength(edited.length);
    expect(activeTopics(restored).map((t) => t.color)).toEqual([...DEFAULT_TOPIC_COLORS.slice(0, 4)]);
  });

  it('reconhece as padrão de dados antigos pelo nome e recria a que faltar', () => {
    const legacy: TopicConfig[] = [
      { id: 'd', name: 'Diversos', targetPct: 0.5, order: 0 },
      { id: 'i', name: 'Investimentos', targetPct: 0.5, order: 1 },
    ];
    const restored = restoreDefaultTopics(legacy);
    const active = activeTopics(restored);
    expect(active.map((t) => t.name)).toEqual(['Diversos', 'Investimentos', 'Metas', 'Conhecimentos']);
    expect(active.slice(0, 2).map((t) => t.id)).toEqual(['d', 'i']);
    expect(validateTopicPercentages(restored).valid).toBe(true);
  });

  it('não confunde uma criada com o mesmo nome de uma padrão que ainda existe', () => {
    const defaults = createDefaultTopics();
    const twin = { ...created('twin', 4), name: 'Metas' };
    const restored = restoreDefaultTopics([...defaults, twin]);
    expect(restored.find((t) => t.id === 'twin')?.archived).toBe(true);
    expect(activeTopics(restored).map((t) => t.id)).toEqual(defaults.map((t) => t.id));
  });
});

describe('categoria nunca é apagada', () => {
  it('uma categoria que sumiu do que foi salvo volta arquivada, no fim', () => {
    const defaults = createDefaultTopics();
    const kept = keepEveryTopic(defaults, defaults.slice(1));
    expect(kept).toHaveLength(4);
    expect(kept.at(-1)).toMatchObject({ id: defaults[0].id, archived: true, order: 4 });
  });

  it('não mexe em nada quando todas continuam lá', () => {
    const defaults = createDefaultTopics();
    expect(keepEveryTopic(defaults, defaults)).toEqual(defaults);
  });
});

describe('categoria arquivada nos meses', () => {
  const topics: TopicConfig[] = [
    { id: 'a', name: 'A', targetPct: 0.5, order: 0 },
    { id: 'b', name: 'B', targetPct: 0.5, order: 1 },
  ];
  const expense = (topicId: string, month: string): Expense => ({
    id: `e-${topicId}`,
    categoryKind: 'topic',
    topicId,
    description: 'x',
    amount: 100,
    date: `${month}-10`,
  });
  const monthData = (month: string, expenses: Expense[] = []): MonthData => ({
    month,
    incomes: [{ id: 'i', source: 'Salário', amount: 1000 }],
    expenses,
    carryIn: { a: 0, b: 0 },
    topicsSnapshot: topics,
  });
  // B archived and A taking its share, in the settings of today.
  const live: TopicConfig[] = [
    { ...topics[0], targetPct: 1 },
    { ...topics[1], archived: true },
  ];

  it('some do mês atual e dos próximos, e as % continuam fechando', () => {
    for (const month of [currentMonthKey(), nextMonth(currentMonthKey())]) {
      const summary = computeMonthSummary(monthData(month), live);
      expect(summary.topics.map((t) => t.topicId)).toEqual(['a']);
      expect(summary.availableTotal).toBe(1000);
    }
  });

  it('fica no mês atual, sem % da renda, enquanto tiver gastos nele', () => {
    const month = currentMonthKey();
    const summary = computeMonthSummary(monthData(month, [expense('b', month)]), live);
    const b = summary.topics.find((t) => t.topicId === 'b');
    expect(b).toMatchObject({ archived: true, targetPct: 0, spent: 100, available: 0, remaining: -100 });
    expect(summary.expenseTotal).toBe(100);
    expect(summary.topics.find((t) => t.topicId === 'a')?.available).toBe(1000);
  });

  it('não muda um mês que já passou', () => {
    const month = previousMonth(currentMonthKey());
    const summary = computeMonthSummary(monthData(month, [expense('b', month)]), live);
    expect(summary.topics.map((t) => [t.topicId, t.targetPct, t.archived])).toEqual([
      ['a', 0.5, false],
      ['b', 0.5, false],
    ]);
  });
});
