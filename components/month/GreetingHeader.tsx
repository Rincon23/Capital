'use client';

import { useEffect, useState } from 'react';
import { greetingFor, greetingLine } from '@/lib/budget';
import { useAuth } from '@/components/providers/AuthProvider';

/**
 * Time-of-day greeting at the top of the home screen ("☀️ Bom dia, Enzo"), the one the bot
 * showed when saying goodbye. Rendered only after mount: the greeting depends on the clock,
 * so rendering it on the server could hydrate into a different one.
 */
export function GreetingHeader() {
  const { user } = useAuth();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
  }, []);

  if (!now) return null;

  return (
    <p className="text-foreground text-base font-semibold">
      <span aria-hidden>{greetingFor(now).emoji} </span>
      {greetingLine(user.name ?? user.email?.split('@')[0], now)}
    </p>
  );
}
