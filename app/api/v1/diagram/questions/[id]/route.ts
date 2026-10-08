import { apiRoute, readJson } from '@/lib/server/http';
import { diagramQuestionUpdateSchema } from '@/lib/server/validation';

export const PUT = apiRoute<{ id: string }>(async ({ request, params, diagram }) => {
  await diagram.updateQuestion(params.id, await readJson(request, diagramQuestionUpdateSchema));
});

/** Removes the question and every answer to it (the screen asks first). */
export const DELETE = apiRoute<{ id: string }>(async ({ params, diagram }) => {
  await diagram.deleteQuestion(params.id);
});
