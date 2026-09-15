import { apiRoute, readJson } from '@/lib/server/http';
import { backupSchema } from '@/lib/server/validation';

/** The account's full backup (the JSON "Exportar dados" downloads). */
export const GET = apiRoute(({ repo }) => repo.exportData());

/** Replaces all of the account's data with the backup. */
export const POST = apiRoute(async ({ request, repo }) => {
  await repo.importData(await readJson(request, backupSchema));
});
