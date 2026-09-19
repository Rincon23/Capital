import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { MoreLayout } from '@/lib/storage/preferences';
import { IconTile, type IconTone } from '@/components/ui/IconTile';

export interface MoreMenuItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: IconTone;
  /** Either a page to open or an action to run. */
  href?: string;
  onClick?: () => void;
}

export interface MoreMenuSection {
  title: string;
  items: MoreMenuItem[];
}

/**
 * The "Mais" tab: who is signed in, then grouped entries, each with its own icon. Two looks, the
 * button in the header switches between them: `list`, the settings list of a phone (label,
 * what it is for and a chevron), and `grid`, the app drawer (a big icon with the name under it).
 * Purely presentational.
 */
export function MoreMenu({
  user,
  sections,
  layout = 'list',
}: {
  user: { name: string | null; email: string | null };
  sections: MoreMenuSection[];
  layout?: MoreLayout;
}) {
  const displayName = user.name?.trim() || user.email?.split('@')[0] || 'Sua conta';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-5 px-4">
      <Link
        href="/configuracoes"
        className="border-border bg-card hover:border-primary/40 flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition"
      >
        <span
          aria-hidden
          className="bg-primary/15 text-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate font-semibold">{displayName}</span>
          {user.email && <span className="text-muted block truncate text-sm">{user.email}</span>}
        </span>
        <ChevronRight aria-hidden className="text-muted h-5 w-5 shrink-0" />
      </Link>

      {sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-2">
          <h2 className="text-muted px-1 text-xs font-semibold tracking-wide uppercase">
            {section.title}
          </h2>
          {layout === 'grid' ? <GridSection items={section.items} /> : <ListSection items={section.items} />}
        </section>
      ))}
    </div>
  );
}

function ListSection({ items }: { items: MoreMenuItem[] }) {
  return (
    <ul className="border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border shadow-sm">
      {items.map((item) => {
        const content = (
          <>
            <IconTile icon={item.icon} tone={item.tone} />
            <span className="min-w-0 flex-1 text-left">
              <span className="text-foreground block font-medium">{item.label}</span>
              <span className="text-muted block truncate text-xs">{item.description}</span>
            </span>
            <ChevronRight aria-hidden className="text-muted h-5 w-5 shrink-0" />
          </>
        );
        const className =
          'hover:bg-background flex min-h-[64px] w-full items-center gap-3 px-4 py-3 transition-colors';
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className={className}>
                {content}
              </Link>
            ) : (
              <button type="button" onClick={item.onClick} className={className}>
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function GridSection({ items }: { items: MoreMenuItem[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        // The description is the accessible name's complement: the tile itself only has room
        // for the label, so the rest goes to the title attribute and to screen readers.
        const content = (
          <>
            <IconTile icon={item.icon} tone={item.tone} size="lg" />
            <span className="text-foreground line-clamp-2 w-full text-center text-xs leading-tight font-medium">
              {item.label}
            </span>
            <span className="sr-only">{item.description}</span>
          </>
        );
        const className =
          'border-border bg-card hover:border-primary/40 flex min-h-[104px] w-full flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 shadow-sm transition active:scale-[0.97]';
        return (
          <li key={item.key} className="min-w-0">
            {item.href ? (
              <Link href={item.href} title={item.description} className={className}>
                {content}
              </Link>
            ) : (
              <button type="button" onClick={item.onClick} title={item.description} className={className}>
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
