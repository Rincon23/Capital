import { apiRoute, readJson } from '@/lib/server/http';
import { cashSettingsSchema } from '@/lib/server/validation';

export const PUT = apiRoute(async ({ request, wallet }) => {
  await wallet.saveCashSettings(await readJson(request, cashSettingsSchema));
});
