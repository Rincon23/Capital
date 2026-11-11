'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { computeProgressState, formatBRL, formatPct, type Month, type TopicResult } from '@/lib/budget';
import { ProgressBar } from '@/components/ui/ProgressBar';

/**
 * What the big number of a category is called. In Investimentos nothing is "left over": what has
 * not gone to the broker yet is still to be invested ("Falta investir"), and going past the limit
 * is having invested more than planned.
 */
export function leftoverLabel(investing: boolean, over: boolean): string {
  if (!investing) return 'Sobra';
  return over ? 'Investiu além do limite' : 'Falta investir';
}

/**
 * One category of the month, with one thing that stands out: what is still left in it ("Sobra"),
 * over a bar of how much of its limit is gone. Where the limit comes from and the entries are one
 * tap ahead (the category's own screen). `investing` is the Investimentos category: what goes to
 * it is money set aside to invest, not money gone, and the card says so ("Falta investir").
 */
export function TopicCard({
  month,
  topic,
  investing = false,
}: {
  month: Month;
  topic: TopicResult;
  investing?: boolean;
}) {
  const over = topic.remaining < 0;
  // A category with no limit yet and nothing spent is an empty bar, not a full one.
  const usedPct = topic.usedPct ?? (topic.spent > 0 ? null : 0);

  return (
    <Link
      href={`/mes/${month}/categoria/${topic.topicId}`}
      className="border-border bg-card hover:border-primary/40 block rounded-xl border p-4 shadow-sm transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: topic.color }}
          />
          <span className="text-foreground truncate font-semibold">{topic.name}</span>
        </span>
        <span className="text-muted flex shrink-0 items-center gap-1 text-xs">
          {formatPct(topic.targetPct, 0)} da renda
          <ChevronRight aria-hidden className="h-4 w-4" />
        </span>
      </div>

      <p className="text-muted mt-3 text-xs">{leftoverLabel(investing, over)}</p>
      <p className={`text-2xl leading-tight font-bold tabular-nums ${over ? 'text-danger' : 'text-foreground'}`}>
        {formatBRL(investing && over ? -topic.remaining : topic.remaining)}
      </p>

      <div className="mt-2.5">
        <ProgressBar
          usedPct={usedPct}
          state={computeProgressState(usedPct)}
          color={over ? undefined : topic.color}
        />
      </div>

      <div className="text-muted mt-2 flex items-baseline justify-between gap-2 text-xs">
        <span>
          {investing ? 'Separou para investir' : 'Gastou'} {formatBRL(topic.spent)}
        </span>
        <span>Limite {formatBRL(topic.available)}</span>
      </div>
    </Link>
  );
}
