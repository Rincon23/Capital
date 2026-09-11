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

/**
 * Snapshot topics with `name` and `color` refreshed from the current settings
 * (matched by id) — always, for every month, so a rename or recolor shows
 * everywhere immediately. `order` / `archived` stay frozen.
 *
 * `targetPct` is only refreshed when `syncTargetPct` is true — the caller's
 * job to decide based on whether the month is in the past (frozen forever)
 * or the current/a future month (tracks Settings live). Topics no longer in
 * `currentTopics` (deleted categories still present in an old month) keep
 * their snapshot values regardless.
 */
export function withCurrentTopicDisplay(
  snapshotTopics: TopicConfig[],
  currentTopics: readonly TopicConfig[] | undefined,
  syncTargetPct = false,
): TopicConfig[] {
  if (!currentTopics) return withTopicColors(snapshotTopics);
  const current = new Map(currentTopics.map((topic) => [topic.id, topic]));
  return withTopicColors(
    snapshotTopics.map((topic) => {
      const live = current.get(topic.id);
      if (!live) return topic;
      return {
        ...topic,
        name: live.name,
        color: live.color ?? topic.color,
        ...(syncTargetPct ? { targetPct: live.targetPct } : {}),
      };
    }),
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
