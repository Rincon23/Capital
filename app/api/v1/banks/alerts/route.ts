import type { BankAlertSettings } from '@/lib/banks';
import { requireBanksAccess } from '@/lib/server/banks/access';
import { apiRoute, readJson } from '@/lib/server/http';
import { bankAlertsSchema } from '@/lib/server/validation';

interface AlertsView {
  settings: BankAlertSettings;
}

/** What the gear of Open Finance shows: what to alert about. */
export const GET = apiRoute(async ({ repo, banks, access }): Promise<AlertsView> => {
  await requireBanksAccess(repo, await access());
  return { settings: await banks.alertSettings() };
});

export const PUT = apiRoute(async ({ request, repo, banks, access }): Promise<AlertsView> => {
  await requireBanksAccess(repo, await access());
  await banks.saveAlertSettings(await readJson(request, bankAlertsSchema));
  return { settings: await banks.alertSettings() };
});
