import type { MonthSummary } from './calculations';
import type { Month, MonthData, TopicConfig } from './types';

/**
 * The carryIn for the month after `previousSummary`: each topic's `remaining`
 * from the closed month, including negative values (debt carries forward).
 */
export function computeCarryInFromPreviousMonth(previousSummary: MonthSummary): Record<string, number> {
  const carryIn: Record<string, number> = {};
  for (const topic of previousSummary.topics) {
    carryIn[topic.topicId] = topic.remaining;
  }
  return carryIn;
}

/** A carryIn of nothing: the first month, or the one after a month closed without its leftovers. */
function zeroCarryIn(topics: TopicConfig[]): Record<string, number> {
  return Object.fromEntries(topics.map((t) => [t.id, 0]));
}

/**
 * The summary the month after `previous` inherits from: none when there is no month before it, or
 * when that month was closed without bringing its leftovers (see `MonthData.leftoversDropped`).
 */
export function carrySource(
  previous: MonthData | undefined,
  computeMonthSummary: (data: MonthData) => MonthSummary,
): MonthSummary | null {
  return previous && !previous.leftoversDropped ? computeMonthSummary(previous) : null;
}

/**
 * Builds an empty MonthData for `month`, carrying over balances from
 * `previousSummary` (or zero for every topic if this is the first month).
 * `topics` is the topic configuration in effect right now, snapshotted onto
 * the new month so later settings edits never retroactively change it.
 */
export function createMonthData(
  month: Month,
  topics: TopicConfig[],
  previousSummary: MonthSummary | null,
): MonthData {
  const carryIn = previousSummary ? computeCarryInFromPreviousMonth(previousSummary) : zeroCarryIn(topics);

  return {
    month,
    incomes: [],
    expenses: [],
    carryIn,
    topicsSnapshot: topics,
  };
}

/**
 * Recomputes carryIn for every month in `months` (ordered oldest to newest,
 * consecutive competence months) from each other in cascade, e.g. after a
 * previously closed month is reopened and its numbers change. The first
 * month keeps its carryIn; a month closed without its leftovers passes on none.
 */
export function cascadeCarryIn(
  months: MonthData[],
  computeMonthSummary: (data: MonthData) => MonthSummary,
): MonthData[] {
  const result: MonthData[] = [];
  let previous: MonthData | undefined;

  for (const data of months) {
    const source = carrySource(previous, computeMonthSummary);
    const carryIn = source
      ? computeCarryInFromPreviousMonth(source)
      : previous
        ? zeroCarryIn(data.topicsSnapshot)
        : data.carryIn;
    const updated: MonthData = { ...data, carryIn };
    result.push(updated);
    previous = updated;
  }

  return result;
}
