'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellOff } from 'lucide-react';
import { IconTile } from '@/components/ui/IconTile';
import { currentSubscription, pushSupport } from '@/lib/notifications/browser';

/** A nudge when this device would not receive the notifications (Lembretes, Monitor de Gmail). */
export function NotificationsHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (pushSupport() !== 'supported') return;
    currentSubscription()
      .then((subscription) => setShow(!subscription))
      .catch(() => setShow(false));
  }, []);

  if (!show) return null;
  return (
    <div className="border-border bg-card mx-4 flex items-center gap-3 rounded-xl border p-3 shadow-sm">
      <IconTile icon={BellOff} tone="amber" />
      <p className="text-muted min-w-0 flex-1 text-sm">Este aparelho ainda não recebe os avisos.</p>
      <Link href="/configuracoes" className="text-primary shrink-0 text-sm font-semibold">
        Ativar
      </Link>
    </div>
  );
}
