import type { BudgetSettings, SpecialCategoryColors, TopicConfig } from './types';

/**
 * Default categorical palette for envelopes, in fixed order. Hex (not CSS vars)
 * so it round-trips through `<input type="color">` and the database. Mirrors the
 * light-theme `--series-*` tokens in app/globals.css.
 */
export const DEFAULT_TOPIC_COLORS = [
  '#2a78d6',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#eb6834',
  '#4a3aa7',
  '#008300',
  '#e34948',
] as const;

/** Defaults for the three special categories. */
export const DEFAULT_SPECIAL_CATEGORY_COLORS: SpecialCategoryColors = {
  fixedCost: '#6b7280',
  unforeseen: '#d97706',
  reimbursed: '#7c3aed',
};

/** Color to use for a topic: its own `color`, else a palette slot by position. */
export function resolveTopicColor(topic: Pick<TopicConfig, 'color'>, index: number): string {
  return topic.color ?? DEFAULT_TOPIC_COLORS[index % DEFAULT_TOPIC_COLORS.length];
}

/**
 * Returns `topics` with every `color` filled in. Missing colors are assigned a
 * palette slot by the topic's position when ordered — deterministic per topic
 * identity, so reordering later never changes a color that was auto-assigned.
 */
export function withTopicColors(topics: TopicConfig[]): TopicConfig[] {
  const slotById = new Map(
    [...topics]
      .sort((a, b) => a.order - b.order)
      .map(
        (topic, index) =>
          [topic.id, DEFAULT_TOPIC_COLORS[index % DEFAULT_TOPIC_COLORS.length]] as const,
      ),
  );
  return topics.map((topic) =>
    topic.color ? topic : { ...topic, color: slotById.get(topic.id) },
  );
}

/** Fills in any missing colors (topics + special categories) so the UI has a complete palette. */
export function normalizeSettings(settings: BudgetSettings): BudgetSettings {
  return {
    ...settings,
    topics: withTopicColors(settings.topics),
    specialCategoryColors: resolveSpecialCategoryColors(settings),
  };
}

/** Special-category colors with any missing entries filled from the defaults. */
export function resolveSpecialCategoryColors(
  source:
    | Pick<BudgetSettings, 'specialCategoryColors'>
    | Partial<SpecialCategoryColors>
    | undefined,
): SpecialCategoryColors {
  const colors =
    source && 'specialCategoryColors' in source ? source.specialCategoryColors : source;
  return { ...DEFAULT_SPECIAL_CATEGORY_COLORS, ...colors };
}
