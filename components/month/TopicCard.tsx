'use client';

import Link from 'next/link';
import { computeProgressState, formatBRL, formatPct, type Month, type TopicResult } from '@/lib/budget';
import { ProgressBar } from '@/components/ui/ProgressBar';

export function TopicCard({ month, topic }: { month: Month; topic: TopicResult }) {
  const state = computeProgressState(topic.usedPct);

  return (
    <Link
      href={`/mes/${month}/categoria/${topic.topicId}`}
      className="border-border bg-card hover:border-primary/40 block rounded-xl border p-4 shadow-sm transition-colors"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-foreground font-semibold">{topic.name}</span>
        <span className="text-muted text-xs">meta {formatPct(topic.targetPct, 0)}</span>
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">Gasto {formatBRL(topic.spent)}</span>
        <span className={`font-semibold ${state === 'danger' ? 'text-danger' : 'text-foreground'}`}>
          Posso gastar {formatBRL(topic.available)}
        </span>
      </div>

      <ProgressBar usedPct={topic.usedPct} state={state} />

      <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">
          {topic.usedPct === null ? '—' : formatPct(topic.usedPct)} utilizada
        </span>
        <span className={topic.remaining < 0 ? 'text-danger font-medium' : 'text-muted'}>
          Sobra {formatBRL(topic.remaining)}
        </span>
      </div>
    </Link>
  );
}
