'use client';

import { useEffect, useState } from 'react';
import { greetingFor } from '@/lib/budget';

/**
 * Time-of-day greeting at the top of the home screen ("☀️ Bom dia"). Just the greeting, with no
 * name or e-mail next to it — nothing here identifies who is signed in. Rendered only after
 * mount: the greeting depends on the clock, so rendering it on the server could hydrate into a
 * different one.
 */
export function GreetingHeader() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
  }, []);

  if (!now) return null;

  const { emoji, text } = greetingFor(now);
  return (
    <p className="text-foreground text-base font-semibold">
      <span aria-hidden>{emoji} </span>
      {text}
    </p>
  );
}
