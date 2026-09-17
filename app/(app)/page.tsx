'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { currentMonthKey } from '@/lib/budget';
import { homeHref } from '@/lib/modules';
import { getLastViewedMonth } from '@/lib/storage/preferences';
import { useSettings } from '@/components/providers/SettingsProvider';

/** "/" opens the first entry of the user's bottom bar (Início, unless they moved it to Mais). */
export default function HomePage() {
  const router = useRouter();
  const { settings } = useSettings();

  useEffect(() => {
    if (!settings) return;
    router.replace(homeHref(settings, getLastViewedMonth() ?? currentMonthKey()));
  }, [router, settings]);

  return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
}
