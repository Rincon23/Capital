import type { BankReview } from '@/lib/banks';
import { requireReviewAccess } from '@/lib/server/banks/access';
import { applyReviewAction, buildReview } from '@/lib/server/banks/review';
import { apiRoute, readJson } from '@/lib/server/http';
import { bankReviewActionSchema } from '@/lib/server/validation';

/** "Confira os gastos": what arrived from the banks and is still to review. */
export const GET = apiRoute(async ({ repo, wallet, banks, access }): Promise<BankReview> => {
  await requireReviewAccess(repo, await access());
  return buildReview({ banks, repo, wallet });
});

/** One decision (launch, tie to an existing entry, ignore, bill paid); answers the list again. */
export const POST = apiRoute(async ({ request, repo, wallet, banks, access }): Promise<BankReview> => {
  await requireReviewAccess(repo, await access());
  await applyReviewAction({ banks, repo, wallet }, await readJson(request, bankReviewActionSchema));
  return buildReview({ banks, repo, wallet });
});
