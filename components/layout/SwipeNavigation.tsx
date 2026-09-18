'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { NavKey } from '@/lib/budget';
import { HOME_NAV, activeNavKey, navEntry, resolveNav } from '@/lib/modules';
import { useLastViewedMonth } from '@/lib/hooks/useLastViewedMonth';
import { useSettings } from '@/components/providers/SettingsProvider';

/** How far (px) a drag must travel before it counts as a swipe, not a tap or a scroll wobble. */
const MIN_DISTANCE = 80;
/** How much more horizontal than vertical the drag must be — a scroll is mostly vertical. */
const MIN_RATIO = 1.5;

/**
 * Whether `target` sits inside something that should keep its own horizontal gesture: a
 * scrollable strip (the Lançamentos tabs, the Histórico table), an open sheet, a text field
 * (selecting text is also a horizontal drag), or anything explicitly opted out with
 * `data-no-swipe-nav` (the bottom-bar and Início editors, which have their own drag-to-reorder).
 */
function insideExcludedArea(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el.matches('input, textarea, [contenteditable="true"], [role="dialog"], [data-no-swipe-nav]')) return true;
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Swiping left or right anywhere in the app moves to the next or previous tab of the bottom bar
 * (Início included), the same order as `BottomNav`. Listens on `window` directly (not through
 * React's synthetic events on a wrapper element) — the same approach dnd-kit's own sensors use —
 * so it is unaffected by any `display: contents` or portal in between. Only the start and end
 * position matter — no `preventDefault` anywhere — so normal vertical scrolling, and any other
 * gesture (dnd-kit's drag included), are never touched.
 */
export function SwipeNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { settings } = useSettings();
  const month = useLastViewedMonth();
  const start = useRef<{ x: number; y: number } | null>(null);
  const excluded = useRef(false);

  // Refs so the window listeners (attached once) always see the latest values.
  const stateRef = useRef({ pathname, settings, month });
  useEffect(() => {
    stateRef.current = { pathname, settings, month };
  });

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      excluded.current = insideExcludedArea(event.target);
      start.current = excluded.current ? null : { x: event.clientX, y: event.clientY };
    }

    function onPointerUp(event: PointerEvent) {
      const from = start.current;
      start.current = null;
      const { pathname, settings, month } = stateRef.current;
      if (!from || excluded.current || !settings) return;

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * MIN_RATIO) return;

      const nav = resolveNav(settings);
      const keys: (NavKey | 'mais')[] = [...nav, 'mais'];
      const active = activeNavKey(nav, pathname);
      if (active === null) return;
      const index = keys.indexOf(active);
      const targetIndex = index + (dx < 0 ? 1 : -1);
      if (targetIndex < 0 || targetIndex >= keys.length) return;

      const key = keys[targetIndex];
      router.push(key === 'mais' ? '/mais' : key === 'inicio' ? HOME_NAV.href(month) : navEntry(key).href(month));
    }

    function onPointerCancel() {
      start.current = null;
    }

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [router]);

  return <>{children}</>;
}
