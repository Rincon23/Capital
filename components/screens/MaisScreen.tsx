'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';

/**
 * Everything that moves out of the bottom bar once the assistant modules fill it up
 * (see `navKeysFor`). Reachable by the "Mais" tab, which only appears in that case.
 */
const LINKS = [
  { href: '/historico', label: 'Histórico', description: 'Sua evolução mês a mês.' },
  {
    href: '/configuracoes',
    label: 'Configurações',
    description: 'Categorias, módulos, tema, backup e conta.',
  },
];

export function MaisScreen() {
  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader title="Mais" />
      <ul className="flex flex-col gap-2 px-4">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="border-border bg-card flex min-h-[64px] w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 shadow-sm"
            >
              <span className="min-w-0">
                <span className="text-foreground block font-medium">{link.label}</span>
                <span className="text-muted block text-xs">{link.description}</span>
              </span>
              <span aria-hidden className="text-muted text-xl">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
