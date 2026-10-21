import 'server-only';
import { isModuleOn } from '@/lib/modules';
import { requireNotVipLocked, type UserAccess } from '../access';
import type { PostgresBudgetRepository } from '../budgetRepository';
import { HttpError } from '../httpError';

/**
 * Any user with the module on (only VIP ones if the owner made it "Só VIP"); each one connects
 * their own Gmail. Checked on every request, whatever the browser shows.
 */
export async function requireGmailAccess(repo: PostgresBudgetRepository, access: UserAccess): Promise<void> {
  requireNotVipLocked(access, 'gmail');
  if (!isModuleOn(await repo.getSettings(), 'gmail')) {
    throw new HttpError(
      403,
      'MODULE_OFF',
      'Ligue "Monitor de Gmail" em Módulos (na bandeja de apps da Início).',
    );
  }
}
