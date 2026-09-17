import { getDb } from '@/lib/server/db';
import { requireGmailAccess } from '@/lib/server/gmail/access';
import { checkGmailAccount } from '@/lib/server/gmail/job';
import { apiRoute, HttpError } from '@/lib/server/http';
import { allowAttempt } from '@/lib/server/rateLimit';

/** "Verificar agora": the same check the minute job does, for this account, right away. */
export const POST = apiRoute(async ({ repo, userId }) => {
  await requireGmailAccess(repo);
  if (!allowAttempt(`gmail-check:${userId}`, 20, 10 * 60_000)) {
    throw new HttpError(429, 'RATE_LIMITED', 'Espere alguns minutos antes de verificar de novo.');
  }
  return checkGmailAccount(getDb(), userId);
});
