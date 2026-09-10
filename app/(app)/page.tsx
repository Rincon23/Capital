'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { currentMonthKey } from '@/lib/budget';
import { getLastViewedMonth } from '@/lib/storage/preferences';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const month = getLastViewedMonth() ?? currentMonthKey();
    router.replace(`/mes/${month}`);
  }, [router]);

  return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
}
