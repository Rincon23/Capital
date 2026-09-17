import type { GmailOverview } from '@/lib/gmail';
import { requireGmailAccess } from '@/lib/server/gmail/access';
import { gmailRedirectUri, googleConfig } from '@/lib/server/gmail/google';
import { apiRoute } from '@/lib/server/http';
import { isOwnerEmail } from '@/lib/server/owner';

/** Everything the Monitor de Gmail screen shows, in one read. */
export const GET = apiRoute(async ({ repo, gmail, email }): Promise<GmailOverview> => {
  await requireGmailAccess(repo);
  const account = await gmail.getAccount();
  return {
    configured: googleConfig() !== null,
    // Setup details are for whoever runs the server, not for every user.
    redirectUri: isOwnerEmail(email) ? gmailRedirectUri() : null,
    account,
    keywords: await gmail.listKeywords(),
    alerts: await gmail.listAlerts(account?.email ?? null),
  };
});
