import 'server-only';
import { isModuleOn } from '@/lib/modules';
import type { UserAccess } from '../access';
import type { PostgresBudgetRepository } from '../budgetRepository';
import { HttpError } from '../httpError';

/**
 * VIP accounts with the module on (it is VIP-only while the owner tries it). Checked on every
 * request, whatever the browser shows.
 */
export async function requireBanksAccess(repo: PostgresBudgetRepository, access: UserAccess): Promise<void> {
  if (!access.vip) {
    throw new HttpError(403, 'VIP_ONLY', 'Open Finance é só para contas VIP.');
  }
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
