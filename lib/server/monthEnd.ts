import { formatMonthName, type Month } from '@/lib/budget';
import { HttpError } from './httpError';

/** The furthest ahead a clock gets anywhere in the world (UTC+14). */
const FURTHEST_AHEAD_MS = 14 * 60 * 60 * 1000;

/**
 * Today's month for whoever is furthest ahead in the day. The server does not know where the
 * person is: a month that is over for them is never held back because it is not over here.
 */
export function latestCurrentMonth(now: Date = new Date()): Month {
  const ahead = new Date(now.getTime() + FURTHEST_AHEAD_MS);
  return `${ahead.getUTCFullYear()}-${String(ahead.getUTCMonth() + 1).padStart(2, '0')}`;
}

function notOver(month: Month): HttpError {
  return new HttpError(
    409,
    'MONTH_NOT_OVER',
    `${formatMonthName(month)} ainda não acabou. Você fecha o mês quando ele terminar.`,
  );
}

/** "Fechar mês": only a month that is over. The screen has no button for the others either. */
export function assertMonthOver(month: Month, now: Date = new Date()): void {
  if (month >= latestCurrentMonth(now)) throw notOver(month);
}

/**
 * "Fechar todos os meses anteriores": the months before `month`, which is today's at the latest —
 * any later and today's month would close with them.
 */
export function assertMonthsBeforeOver(month: Month, now: Date = new Date()): void {
  const current = latestCurrentMonth(now);
  if (month > current) throw notOver(current);
}
