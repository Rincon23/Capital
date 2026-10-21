import type { BankReviewCounts } from '@/lib/banks';
import { requireReviewAccess } from '@/lib/server/banks/access';
import { reviewCounts } from '@/lib/server/banks/review';
import { apiRoute } from '@/lib/server/http';

/** How many lines of this month still ask for a tap, for the bank screen and the Início. */
export const GET = apiRoute(async ({ repo, wallet, banks, access }): Promise<BankReviewCounts> => {
  await requireReviewAccess(repo, await access());
  return reviewCounts({ banks, repo, wallet });
});
