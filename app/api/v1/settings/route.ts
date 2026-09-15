import { apiRoute, readJson } from '@/lib/server/http';
import { settingsSchema } from '@/lib/server/validation';

export const GET = apiRoute(({ repo }) => repo.getSettings());

export const PUT = apiRoute(async ({ request, repo }) => {
  await repo.saveSettings(await readJson(request, settingsSchema));
});
