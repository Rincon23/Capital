import { requireVoiceAccess } from '@/lib/server/ai/access';
import { apiRoute, HttpError, readJson } from '@/lib/server/http';
import { allowAttempt } from '@/lib/server/rateLimit';
import { aiProblemReportSchema } from '@/lib/server/validation';

/** Line breaks and other control characters: they could forge lines in the server log. */
function oneLine(text: string): string {
  return text.replace(/\p{Cc}+/gu, ' ');
}

/**
 * The app tells the server when an analysis failed on its side (the stream cut off, a parse
 * error), with what it had received. Only logged, so a failure on the phone can be matched
 * with the server's own log line for the same analysis.
 */
export const POST = apiRoute(async ({ request, repo, email, access, userId }) => {
  await requireVoiceAccess(repo, email, await access(), { countAttempt: false });
  const { kind, detail } = await readJson(request, aiProblemReportSchema);
  if (!allowAttempt(`ai-report:${userId}`, 10, 60 * 60_000)) {
    throw new HttpError(429, 'RATE_LIMITED', 'Muitos relatos seguidos.');
  }
  const agent = request.headers.get('user-agent')?.slice(0, 160) ?? 'sem user-agent';
  console.warn(`[ia] falha relatada pelo app (${kind}): ${oneLine(detail)} | ${oneLine(agent)}`);
});
