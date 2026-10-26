import 'server-only';
import { requireNotVipLocked, type UserAccess } from '../access';

/**
 * Every account has the Gmail monitor (only those with access while the owner keeps it
 * "Restrito"); each one connects their own Gmail. Checked on every request, whatever the browser
 * shows.
 */
export function requireGmailAccess(access: UserAccess): void {
  requireNotVipLocked(access, 'gmail');
}
