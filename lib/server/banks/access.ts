import 'server-only';
import { isModuleOn } from '@/lib/modules';
import { requireNotVipLocked, type UserAccess } from '../access';
import type { PostgresBudgetRepository } from '../budgetRepository';
import { HttpError } from '../httpError';

/**
 * Accounts with the module on, and only VIP ones while the owner keeps it "Só VIP" (it starts so,
 * for the owner to try it first). Checked on every request, whatever the browser shows.
 */
export async function requireBanksAccess(repo: PostgresBudgetRepository, access: UserAccess): Promise<void> {
  requireNotVipLocked(access, 'banks');
  if (!isModuleOn(await repo.getSettings(), 'banks')) {
    throw new HttpError(403, 'MODULE_OFF', 'Ligue "Open Finance" em Módulos (na bandeja de apps da Início).');
  }
}

/** "Confira os gastos" launches into Lançamentos: it needs that module on too. */
export async function requireReviewAccess(repo: PostgresBudgetRepository, access: UserAccess): Promise<void> {
  await requireBanksAccess(repo, access);
  if (!isModuleOn(await repo.getSettings(), 'expenses')) {
    throw new HttpError(403, 'MODULE_OFF', 'Ligue "Lançamentos" em Módulos para conferir os gastos.');
  }
}
