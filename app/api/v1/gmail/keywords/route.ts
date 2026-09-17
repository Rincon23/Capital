import { requireGmailAccess } from '@/lib/server/gmail/access';
import { apiRoute, readJson } from '@/lib/server/http';
import { gmailKeywordSchema } from '@/lib/server/validation';

export const POST = apiRoute(async ({ request, repo, gmail }) => {
  await requireGmailAccess(repo);
  const { keyword } = await readJson(request, gmailKeywordSchema);
  return gmail.addKeyword(keyword);
});
