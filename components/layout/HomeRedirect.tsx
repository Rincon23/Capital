'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { currentMonthKey } from '@/lib/budget';
import { OPEN_APPS_PARAM, homeHref } from '@/lib/modules';
import { getLastViewedMonth } from '@/lib/storage/preferences';

/**
 * Sends the person to the Início of the month they last looked at: what "/" does, and where the
 * old addresses of the bottom-bar era land (`/rodape`, and `/mais`, with the app drawer open).
 * The month lives on this device (localStorage), so this can only happen in the browser.
 */
export function HomeRedirect({ openApps = false }: { openApps?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const href = homeHref(getLastViewedMonth() ?? currentMonthKey());
    router.replace(openApps ? `${href}?${OPEN_APPS_PARAM}=1` : href);
  }, [router, openApps]);

  return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
}
