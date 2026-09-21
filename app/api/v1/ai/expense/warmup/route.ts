import { buildPromptPrefix } from '@/lib/ai';
import { requireVoiceAccess } from '@/lib/server/ai/access';
import { warmUp } from '@/lib/server/ai/engine';
import { apiRoute } from '@/lib/server/http';
import { allowAttempt } from '@/lib/server/rateLimit';

/**
 * Called when the voice sheet opens: gets the model into memory and the prompt read while
 * the user is still talking. Answers right away; the warm-up goes on in the background. Like the
 * analyses it heats the board, so it is limited per account (past the limit the sheet still
 * works, it just starts cold).
 */
export const POST = apiRoute(async ({ repo, email, access, userId }) => {
  const voice = await requireVoiceAccess(repo, email, await access(), { countAttempt: false });
  if (!allowAttempt(`ai-warmup:${userId}`, 20, 60 * 60_000)) return;
  void warmUp(voice.extractor, buildPromptPrefix(voice.options, voice.today));
});
