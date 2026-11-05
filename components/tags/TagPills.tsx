'use client';

import { entryTags, type Tag } from '@/lib/budget';

/**
 * An entry's tags as small "#Mercado" pills, the first `max` and then "+N". A tag reads
 * differently from a category on purpose: a category is shown by its name and colour, a tag by
 * the "#".
 */
export function TagPills({
  tagIds,
  tags,
  max = 2,
}: {
  tagIds: readonly string[] | undefined;
  tags: readonly Tag[] | undefined;
  max?: number;
}) {
  const list = entryTags(tagIds, tags);
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1 align-middle">
      {shown.map((tag) => (
        <TagPill key={tag.id} tag={tag} />
      ))}
      {rest > 0 && (
        <span className="text-muted text-[11px] font-medium" aria-label={`e mais ${rest} tags`}>
          +{rest}
        </span>
      )}
    </span>
  );
}

export function TagPill({ tag }: { tag: Tag }) {
  return (
    <span
      className="bg-background text-foreground border-border inline-flex max-w-[10rem] items-center rounded-full border px-1.5 py-px text-[11px] leading-4 font-medium"
      style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
    >
      <span className="truncate">#{tag.name}</span>
    </span>
  );
}
