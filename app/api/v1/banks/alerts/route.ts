import type { BankAlertSettings, SalaryCandidate } from '@/lib/banks';
import { addDays, zonedToday } from '@/lib/reminders/time';
import { requireBanksAccess } from '@/lib/server/banks/access';
import { apiRoute, readJson } from '@/lib/server/http';
import { bankAlertsSchema } from '@/lib/server/validation';

/** How far back the salary candidates go: a monthly salary shows up at least twice. */
const CANDIDATE_DAYS = 70;

interface AlertsView {
  settings: BankAlertSettings;
  /** Recent credits the person can point at as their salary. */
  candidates: SalaryCandidate[];
}

/** What the gear of Open Finance shows: what to alert about, and the credits that could be the salary. */
export const GET = apiRoute(async ({ repo, banks, access }): Promise<AlertsView> => {
  await requireBanksAccess(repo, await access());
  return {
    settings: await banks.alertSettings(),
    candidates: await banks.salaryCandidates(addDays(zonedToday(), -CANDIDATE_DAYS)),
  };
});

export const PUT = apiRoute(async ({ request, repo, banks, access }): Promise<AlertsView> => {
  await requireBanksAccess(repo, await access());
  const { salaryTransactionIds, ...choices } = await readJson(request, bankAlertsSchema);
  const previous = await banks.alertSettings();
  await banks.saveAlertSettings({
    ...choices,
    salaries: await banks.salaryRefs(salaryTransactionIds, previous.salaries),
  });
  return {
    settings: await banks.alertSettings(),
    candidates: await banks.salaryCandidates(addDays(zonedToday(), -CANDIDATE_DAYS)),
  };
});
