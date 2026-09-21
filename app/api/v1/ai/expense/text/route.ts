import { acquireAnalysisSlot, progressStream, requireVoiceAccess } from '@/lib/server/ai/access';
import { analyzeExpense } from '@/lib/server/ai/engine';
import { apiRoute, readJson } from '@/lib/server/http';
import { aiExpenseTextSchema } from '@/lib/server/validation';

/** "Descreva o gasto" → a draft for review, streaming the progress. Saves nothing. */
export const POST = apiRoute(async ({ request, repo, email, access }) => {
  const { text } = await readJson(request, aiExpenseTextSchema);
  const voice = await requireVoiceAccess(repo, email, await access(), { countAttempt: true });
  const release = acquireAnalysisSlot();
  return progressStream(
    request,
    `texto (${text.length} caracteres)`,
    (emit, signal) =>
      analyzeExpense(
        { kind: 'text', text },
        { options: voice.options, today: voice.today, signal },
        voice,
        emit,
      ),
    release,
  );
});
