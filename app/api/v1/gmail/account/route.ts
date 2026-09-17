import { requireGmailAccess } from '@/lib/server/gmail/access';
import { forgetGmailToken } from '@/lib/server/gmail/job';
import { apiRoute } from '@/lib/server/http';

/**
 * "Desconectar": forgets the stored connection; keywords and history stay. It deliberately does
 * not revoke the permission at Google: the grant belongs to the Google Cloud client, and n8n may
 * use the same one — revoking would cut its Gmail monitor off too.
 */
export const DELETE = apiRoute(async ({ repo, gmail, userId }) => {
  await requireGmailAccess(repo);
  forgetGmailToken(userId);
  await gmail.deleteAccount();
});
