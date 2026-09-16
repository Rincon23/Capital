import { buildPromptPrefix } from '@/lib/ai';
import { requireVoiceAccess } from '@/lib/server/ai/access';
import { warmUp } from '@/lib/server/ai/engine';
import { apiRoute } from '@/lib/server/http';

/**
 * Called when the voice sheet opens: gets the model into memory and the prompt read while
 * the user is still talking. Answers right away; the warm-up goes on in the background.
 */
export const POST = apiRoute(async ({ repo, email }) => {
  const access = await requireVoiceAccess(repo, email, { countAttempt: false });
  void warmUp(access.extractor, buildPromptPrefix(access.options, access.today));
});
