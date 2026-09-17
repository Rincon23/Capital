import 'server-only';
import { isModuleOn } from '@/lib/modules';
import type { PostgresBudgetRepository } from '../budgetRepository';
import { HttpError } from '../httpError';

/**
 * Any user with the module on; each one connects their own Gmail. Checked on every request,
 * whatever the browser shows.
 */
export async function requireGmailAccess(repo: PostgresBudgetRepository): Promise<void> {
  if (!isModuleOn(await repo.getSettings(), 'gmail')) {
    throw new HttpError(403, 'MODULE_OFF', 'Ligue "Monitor de Gmail" em Mais → Módulos.');
  }
}
