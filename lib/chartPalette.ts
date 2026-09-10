/** Fixed-order categorical palette (never cycled per series identity) — see app/globals.css --series-*. */
export const SERIES_COLORS = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
  'var(--color-series-5)',
  'var(--color-series-6)',
  'var(--color-series-7)',
  'var(--color-series-8)',
];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
