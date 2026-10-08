'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import type { DiagramOverview } from '@/lib/diagram';
import { diagramRepository } from '@/lib/storage';
import { toStorageErrorMessage } from '@/lib/storage/errors';
import { IconTile } from '@/components/ui/IconTile';
import { PortfolioChart } from '@/components/diagram/PortfolioCard';
import { MODULE_VISUALS } from '../visuals';
import { CardNote, Skeleton } from './HomeCard';

/** Diagrama: the portfolio by type (today × target) and a shortcut to a new aporte. */
export function DiagramHomeCard() {
  const [overview, setOverview] = useState<DiagramOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visual = MODULE_VISUALS.diagram;

  useEffect(() => {
    let active = true;
    diagramRepository
      .getOverview()
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch((err: unknown) => {
        if (active) setError(toStorageErrorMessage(err, 'Não foi possível carregar o Diagrama.'));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
      data-tour="card-diagram"
    >
      <Link href="/diagrama" className="flex items-center gap-3">
        <IconTile icon={visual.icon} tone={visual.tone} />
        <p className="text-foreground min-w-0 flex-1 truncate font-semibold">Diagrama</p>
        <ChevronRight aria-hidden className="text-muted h-4 w-4 shrink-0" />
      </Link>
      {error ? (
        <CardNote tone="danger">{error}</CardNote>
      ) : !overview ? (
        <div className="flex items-center gap-4">
          <Skeleton className="h-[104px] w-[104px] rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ) : (
        <Link href="/diagrama" className="block">
          <PortfolioChart overview={overview} compact />
        </Link>
      )}
      <Link
        href="/diagrama?aba=aporte"
        className="bg-primary text-primary-foreground flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold"
      >
        <Plus aria-hidden className="h-4 w-4" />
        Novo aporte
      </Link>
    </section>
  );
}
