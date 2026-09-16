import { requireVoiceAccess, progressStream } from '@/lib/server/ai/access';
import { analyzeExpense } from '@/lib/server/ai/engine';
import { apiRoute, readJson } from '@/lib/server/http';
import { aiExpenseTextSchema } from '@/lib/server/validation';

/** "Descreva o gasto" → a draft for review, streaming the progress. Saves nothing. */
export const POST = apiRoute(async ({ request, repo, email }) => {
  const { text } = await readJson(request, aiExpenseTextSchema);
  const access = await requireVoiceAccess(repo, email, { countAttempt: true });
  return progressStream(request, (emit, signal) =>
    analyzeExpense(
      { kind: 'text', text },
      { options: access.options, today: access.today, signal },
      access,
      emit,
    ),
  );
});
