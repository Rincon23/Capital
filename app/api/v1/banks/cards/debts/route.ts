import type { BankCardDebt } from '@/lib/banks';
import { requireBanksAccess } from '@/lib/server/banks/access';
import { apiRoute } from '@/lib/server/http';

/**
 * What the bank says is owed on each Capital card tied to a bank card, for the Cartão to show
 * beside the bill the person entered (never instead of it).
 */
export const GET = apiRoute(async ({ banks, access }): Promise<BankCardDebt[]> => {
  requireBanksAccess(await access());
  return banks.cardDebts();
});
