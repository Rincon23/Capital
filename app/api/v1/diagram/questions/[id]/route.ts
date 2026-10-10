import { HttpError, apiRoute, readJson } from '@/lib/server/http';
import { diagramQuestionUpdateSchema } from '@/lib/server/validation';

/** Edits a question; `auto: null` makes an automatic one normal again (turning one on is VIP). */
export const PUT = apiRoute<{ id: string }>(async ({ request, params, diagram, access }) => {
  const input = await readJson(request, diagramQuestionUpdateSchema);
  if (input.auto && !(await access()).vip) {
    throw new HttpError(403, 'VIP_ONLY', 'As perguntas automáticas são só para contas VIP.');
  }
  await diagram.updateQuestion(params.id, input);
});

/** Removes the question and every answer to it (the screen asks first). */
export const DELETE = apiRoute<{ id: string }>(async ({ params, diagram }) => {
  await diagram.deleteQuestion(params.id);
});
