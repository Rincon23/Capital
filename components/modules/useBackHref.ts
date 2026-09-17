'use client';

import type { NavKey } from '@/lib/budget';
import { resolveNav } from '@/lib/modules';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Where a screen's back arrow goes: nowhere when the screen is in the bottom bar (it is a tab),
 * otherwise Mais, which is where the user reaches it from.
 */
export function useBackHref(key: NavKey): string | undefined {
  const { settings } = useSettings();
  if (!settings) return undefined;
  return resolveNav(settings).includes(key) ? undefined : '/mais';
}
