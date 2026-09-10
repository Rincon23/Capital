'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: ReactNode;
}) {
  return (
    <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex items-center gap-2 border-b px-4 py-3 backdrop-blur">
      {backHref && (
        <Link
          href={backHref}
          aria-label="Voltar"
          className="text-foreground hover:bg-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
        >
          ‹
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-foreground truncate text-lg font-semibold">{title}</h1>
        {subtitle && <p className="text-muted truncate text-sm">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
