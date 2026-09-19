'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { BudgetSettings, Month, NavKey } from '@/lib/budget';
import { HOME_NAV, activeNavKey, navEntry, resolveNav } from '@/lib/modules';
import { useLastViewedMonth } from '@/lib/hooks/useLastViewedMonth';
import { useSettings } from '@/components/providers/SettingsProvider';

/** How far (px) the finger travels before the drag is read as a sideways swipe. */
const LOCK_DISTANCE = 10;
/** How much more horizontal than vertical it must be at that point — a scroll is mostly vertical. */
const MIN_RATIO = 1.2;
/** Fraction of the screen that changes tab on release… */
const COMMIT_FRACTION = 0.3;
/** …or this speed (px/ms), so a short flick works too — as long as it went at least… */
const COMMIT_VELOCITY = 0.45;
const MIN_FLICK_DISTANCE = 45;
/** Window (ms) the speed of the flick is measured over. */
const VELOCITY_WINDOW = 90;
/** How much of the drag the screen still follows when there is no tab on that side. */
const EDGE_RESISTANCE = 0.28;
/** The screen leaving, the screen arriving, and the screen falling back into place. */
const OUT_MS = 180;
const IN_MS = 240;
const BACK_MS = 260;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
/** If the next screen is not ready by then, slide back instead of holding an empty page. */
const NAVIGATION_TIMEOUT_MS = 700;

/** -1 is the tab on the left, 1 the tab on the right. */
type Direction = -1 | 1;

interface SwipeState {
  pathname: string;
  settings: BudgetSettings | null;
  month: Month;
}

/**
 * Where the tab on that side of the current one lives — `BottomNav`'s order, with Mais last — or
 * null when the current screen is already the first or the last of the bar.
 */
function neighbourHref({ pathname, settings, month }: SwipeState, direction: Direction): string | null {
  if (!settings) return null;
  const nav = resolveNav(settings);
  const keys: (NavKey | 'mais')[] = [...nav, 'mais'];
  const active = activeNavKey(nav, pathname);
  if (active === null) return null;
  const target = keys.indexOf(active) + direction;
  if (target < 0 || target >= keys.length) return null;
  const key = keys[target];
  return key === 'mais' ? '/mais' : key === 'inicio' ? HOME_NAV.href(month) : navEntry(key).href(month);
}

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

interface Drag {
  x: number;
  y: number;
  /** Where the finger was a moment ago, to measure the speed of a flick on release. */
  markX: number;
  markTime: number;
  /** Set once the gesture is read as horizontal; before that nothing moves. */
  locked: boolean;
  /** Set once it is read as a scroll instead: the rest of this gesture is not ours. */
  dropped: boolean;
  width: number;
}

/**
 * Swiping left or right anywhere in the app moves to the next or previous tab of the bottom bar
 * (Início included), the same order as `BottomNav` — and the screen follows the finger while it
 * does, like the home screen of a phone: it slides with the drag, falls back into place when the
 * drag is too short, and slides the rest of the way out (with the next tab coming in from the
 * other side) when it is enough. Both neighbours are prefetched, so the screen being swiped away
 * is replaced by the next one without a gap.
 *
 * Listens on `window` directly (not through React's synthetic events on a wrapper element) — the
 * same approach dnd-kit's own sensors use — so it is unaffected by any `display: contents` or
 * portal in between. Nothing calls `preventDefault`: `touch-action: pan-y` (in `globals.css`)
 * already tells the browser that sideways is ours and up/down is its own, so normal scrolling and
 * every other gesture (dnd-kit's drag included) are never touched.
 */
export function SwipeNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { settings } = useSettings();
  const month = useLastViewedMonth();
  const page = useRef<HTMLDivElement>(null);

  // Refs so the window listeners (attached once) always see the latest values.
  const stateRef = useRef<SwipeState>({ pathname, settings, month });
  useEffect(() => {
    stateRef.current = { pathname, settings, month };
  });

  const drag = useRef<Drag | null>(null);
  /** Which side the screen being opened has to come in from, while the navigation is in flight. */
  const arriving = useRef<Direction | null>(null);
  /** A drag that moved the screen must not also count as a tap on whatever was under the finger. */
  const swallowClick = useRef(false);
  const timers = useRef<number[]>([]);

  // The two neighbours, ready before the finger ever touches the screen: a tab change then only
  // costs the animation, not a round trip.
  useEffect(() => {
    if (!settings) return;
    for (const direction of [-1, 1] as Direction[]) {
      const href = neighbourHref({ pathname, settings, month }, direction);
      if (href) router.prefetch(href);
    }
  }, [pathname, settings, month, router]);

  useEffect(() => {
    const clearTimers = () => {
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
    const after = (ms: number, run: () => void) => {
      timers.current.push(window.setTimeout(run, ms));
    };
    /** Back to a plain, untransformed element: a transform left behind would trap `position: fixed`. */
    const rest = () => {
      const el = page.current;
      if (!el) return;
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
    };

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      clearTimers();
      swallowClick.current = false;
      // A new gesture during an animation takes the screen over from wherever it is.
      if (arriving.current === null) rest();
      if (insideExcludedArea(event.target)) {
        drag.current = null;
        return;
      }
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        markX: event.clientX,
        markTime: event.timeStamp,
        locked: false,
        dropped: false,
        width: window.innerWidth,
      };
    }

    function onPointerMove(event: PointerEvent) {
      const state = drag.current;
      const el = page.current;
      if (!state || state.dropped || !el) return;

      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;

      if (!state.locked) {
        if (Math.abs(dx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE) return;
        // The first clear movement decides: sideways is ours, anything else is the page's scroll.
        if (Math.abs(dx) < Math.abs(dy) * MIN_RATIO) {
          state.dropped = true;
          return;
        }
        state.locked = true;
        clearTimers();
        arriving.current = null;
        el.style.transition = 'none';
        el.style.willChange = 'transform';
        // Warm both sides again: the drag may well end on one of them.
        for (const direction of [-1, 1] as Direction[]) {
          const href = neighbourHref(stateRef.current, direction);
          if (href) router.prefetch(href);
        }
      }

      if (event.timeStamp - state.markTime > VELOCITY_WINDOW) {
        state.markX = event.clientX;
        state.markTime = event.timeStamp;
      }

      // Nothing on that side: the screen still gives a little, then holds — the rubber band of a
      // phone home screen saying "this is the last one".
      const free = neighbourHref(stateRef.current, dx < 0 ? 1 : -1) !== null;
      el.style.transform = `translate3d(${free ? dx : dx * EDGE_RESISTANCE}px, 0, 0)`;
    }

    function onPointerUp(event: PointerEvent) {
      const state = drag.current;
      drag.current = null;
      const el = page.current;
      if (!state || !state.locked || !el) return;
      swallowClick.current = true;

      const dx = event.clientX - state.x;
      const direction: Direction = dx < 0 ? 1 : -1;
      const href = neighbourHref(stateRef.current, direction);
      const elapsed = Math.max(event.timeStamp - state.markTime, 1);
      const speed = Math.abs(event.clientX - state.markX) / elapsed;
      const enough =
        Math.abs(dx) > state.width * COMMIT_FRACTION ||
        (speed > COMMIT_VELOCITY && Math.abs(dx) > MIN_FLICK_DISTANCE);

      if (!href || !enough) {
        el.style.transition = `transform ${BACK_MS}ms ${EASE}`;
        el.style.transform = 'translate3d(0, 0, 0)';
        after(BACK_MS, rest);
        return;
      }

      arriving.current = direction;
      el.style.transition = `transform ${OUT_MS}ms ${EASE}`;
      el.style.transform = `translate3d(${-direction * 100}%, 0, 0)`;
      router.push(href);
      // The next screen is normally already in the client cache and lands well inside OUT_MS.
      // If something went wrong, fall back into place rather than sit on an empty page.
      after(NAVIGATION_TIMEOUT_MS, () => {
        if (arriving.current === null) return;
        arriving.current = null;
        const node = page.current;
        if (!node) return;
        node.style.transition = `transform ${BACK_MS}ms ${EASE}`;
        node.style.transform = 'translate3d(0, 0, 0)';
        after(BACK_MS, rest);
      });
    }

    function onClickCapture(event: MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }

    function onPointerCancel() {
      const state = drag.current;
      drag.current = null;
      if (!state?.locked) return;
      const el = page.current;
      if (!el) return;
      el.style.transition = `transform ${BACK_MS}ms ${EASE}`;
      el.style.transform = 'translate3d(0, 0, 0)';
      after(BACK_MS, rest);
    }

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('click', onClickCapture, true);
      clearTimers();
    };
  }, [router]);

  // The screen that just arrived: put it on the side the swipe was heading to, then let it slide
  // in. Any other navigation (a tap in the bottom bar, a link) leaves it exactly where it is.
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];

    const direction = arriving.current;
    arriving.current = null;
    if (direction === null) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.willChange = '';
      return;
    }

    el.style.transition = 'none';
    el.style.transform = `translate3d(${direction * 100}%, 0, 0)`;
    el.style.willChange = 'transform';
    // Two frames: the start position has to be painted before the transition can run from it.
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = page.current;
        if (!node) return;
        node.style.transition = `transform ${IN_MS}ms ${EASE}`;
        node.style.transform = 'translate3d(0, 0, 0)';
        timers.current.push(
          window.setTimeout(() => {
            node.style.transition = '';
            node.style.transform = '';
            node.style.willChange = '';
          }, IN_MS),
        );
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    // `overflow-x: clip` (not `hidden`) keeps the screen that slides out of sight from widening
    // the page, without turning this into a scroll container — the sticky headers inside still
    // stick to the top of the window.
    <div className="flex min-h-full flex-1 flex-col overflow-x-clip">
      <div ref={page} className="flex min-h-full flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
