import { apiRoute } from '@/lib/server/http';

/** "Apagar todos os dados": every month and the settings of the signed-in account. */
export const DELETE = apiRoute(async ({ repo }) => {
  await repo.clearAll();
});
