import { DEFAULT_TOPIC_COLORS, resolveTopicColor } from './colors';
import { createId } from './id';
import type { TopicConfig, TopicPreset } from './types';

export interface DefaultTopic {
  preset: TopicPreset;
  name: string;
  description: string;
  targetPct: number;
}

/**
 * The four categories every account starts with, and what each one is for. The descriptions are
 * the way the app teaches to use them; people can rewrite them.
 */
export const DEFAULT_TOPICS: readonly DefaultTopic[] = [
  {
    preset: 'diversos',
    name: 'Diversos',
    description:
      'Os prazeres e confortos da vida, presentes e coisas que poderiam esperar, mas você quer agora.',
    targetPct: 0.2,
  },
  {
    preset: 'investimentos',
    name: 'Investimentos',
    description: 'Qualquer investimento que faça o seu dinheiro render.',
    targetPct: 0.45,
  },
  {
    preset: 'metas',
    name: 'Metas',
    description: 'As conquistas maiores: casa, carro, casamento, aniversário, viagem.',
    targetPct: 0.25,
  },
  {
    preset: 'conhecimentos',
    name: 'Conhecimentos',
    description: 'Tudo que agrega conhecimento: cursos, livros, eventos.',
    targetPct: 0.1,
  },
];

/** What income, fixed costs and unforeseen costs mean, wherever the categories are explained. */
export const BUDGET_EXPLANATIONS = {
  income: 'Tudo que entrou no mês. Cada categoria recebe a sua % dessa renda.',
  fixedCost:
    'O que você paga todo mês e não dá pra cortar: aluguel, contas, assinaturas, faculdade. O total sai de cada categoria, na proporção da % dela.',
  unforeseen:
    'O que não dava pra evitar: celular quebrado, óculos, consulta de última hora. Também sai de cada categoria, na proporção da % dela.',
} as const;

/** When a monthly expense is better filed as a fixed cost than under a category. */
export const FIXED_COST_TIP =
  'Um gasto que se repete todo mês e é maior do que a categoria recebe fica melhor em custo fixo. Uma faculdade de R$ 1.000 por mês, por exemplo, é custo fixo, não Conhecimentos.';

/** Shown next to every way of creating a category. */
export const KEEP_DEFAULT_TOPICS_ADVICE =
  'A maioria das pessoas fica satisfeita com as quatro categorias padrão. Sugerimos fortemente não criar outras: ajuste só as porcentagens.';

export function createDefaultTopics(): TopicConfig[] {
  return DEFAULT_TOPICS.map((topic, index) => ({
    id: createId(),
    ...topic,
    order: index,
    color: DEFAULT_TOPIC_COLORS[index],
  }));
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

/**
 * Which default category a topic is: its `preset`, or, for data from before presets existed (no
 * `preset` and no `description` of its own), the default with the same name.
 */
function presetOf(topic: TopicConfig): DefaultTopic | undefined {
  if (topic.preset) return DEFAULT_TOPICS.find((d) => d.preset === topic.preset);
  if (topic.description !== undefined) return undefined;
  return DEFAULT_TOPICS.find((d) => fold(d.name) === fold(topic.name));
}

/** The text that says what a category is for: its own, or the default one's. */
export function topicDescription(topic: TopicConfig): string {
  return topic.description ?? presetOf(topic)?.description ?? '';
}

/**
 * A topic with its preset and description made explicit (older data had neither), so an editor
 * can show and save them without losing which default category it is.
 */
export function normalizeTopic(topic: TopicConfig): TopicConfig {
  const preset = presetOf(topic)?.preset;
  return { ...topic, ...(preset ? { preset } : {}), description: topicDescription(topic) };
}

/** The categories in use (archived ones are never shown), in order. */
export function activeTopics(topics: readonly TopicConfig[]): TopicConfig[] {
  return topics.filter((topic) => !topic.archived).sort((a, b) => a.order - b.order);
}

/**
 * Back to the default categories: the four defaults come back (active, with their name,
 * description, colour, percentage and place) and every other category is archived. Nothing is
 * deleted, so past months keep what each category had.
 */
export function restoreDefaultTopics(topics: readonly TopicConfig[]): TopicConfig[] {
  const used = new Set<string>();
  const defaults = DEFAULT_TOPICS.map((preset, index) => {
    const existing =
      topics.find((t) => t.preset === preset.preset) ??
      topics.find((t) => !t.preset && !used.has(t.id) && presetOf(t)?.preset === preset.preset);
    if (existing) used.add(existing.id);
    return {
      ...existing,
      id: existing?.id ?? createId(),
      ...preset,
      order: index,
      color: DEFAULT_TOPIC_COLORS[index],
      archived: false,
    };
  });
  const others = [...topics]
    .filter((topic) => !used.has(topic.id))
    .sort((a, b) => a.order - b.order)
    .map((topic, index) => ({ ...topic, archived: true, order: DEFAULT_TOPICS.length + index }));
  return [...defaults, ...others];
}

/** True when the active categories are exactly the defaults, as they come. */
export function hasDefaultTopics(topics: readonly TopicConfig[]): boolean {
  const active = activeTopics(topics);
  return (
    active.length === DEFAULT_TOPICS.length &&
    DEFAULT_TOPICS.every((preset, index) => {
      const topic = active[index];
      return (
        presetOf(topic)?.preset === preset.preset &&
        topic.name === preset.name &&
        topicDescription(topic) === preset.description &&
        resolveTopicColor(topic, index).toLowerCase() === DEFAULT_TOPIC_COLORS[index] &&
        Math.abs(topic.targetPct - preset.targetPct) < 1e-9
      );
    })
  );
}

/**
 * Categories are never deleted: a save that leaves one out keeps it, archived, at the end. Guards
 * the data even against an older client that still had a delete button.
 */
export function keepEveryTopic(
  previous: readonly TopicConfig[],
  next: readonly TopicConfig[],
): TopicConfig[] {
  const ids = new Set(next.map((topic) => topic.id));
  const missing = previous.filter((topic) => !ids.has(topic.id));
  if (missing.length === 0) return [...next];
  const end = Math.max(-1, ...next.map((topic) => topic.order)) + 1;
  return [...next, ...missing.map((topic, index) => ({ ...topic, archived: true, order: end + index }))];
}
