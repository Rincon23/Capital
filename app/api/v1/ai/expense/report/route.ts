import { requireVoiceAccess } from '@/lib/server/ai/access';
import { apiRoute, readJson } from '@/lib/server/http';
import { aiProblemReportSchema } from '@/lib/server/validation';

/**
 * The app tells the server when an analysis failed on its side (the stream cut off, a parse
 * error), with what it had received. Only logged, so a failure on the phone can be matched
 * with the server's own log line for the same analysis.
 */
export const POST = apiRoute(async ({ request, repo, email }) => {
  await requireVoiceAccess(repo, email, { countAttempt: false });
  const { kind, detail } = await readJson(request, aiProblemReportSchema);
  const agent = request.headers.get('user-agent')?.slice(0, 160) ?? 'sem user-agent';
  console.warn(`[ia] falha relatada pelo app (${kind}): ${detail} | ${agent}`);
});
