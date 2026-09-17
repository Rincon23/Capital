import { z } from 'zod';
import { requireGmailAccess } from '@/lib/server/gmail/access';
import { apiRoute } from '@/lib/server/http';

export const DELETE = apiRoute<{ id: string }>(async ({ params, repo, gmail }) => {
  await requireGmailAccess(repo);
  // Keyword ids are UUIDs; anything else cannot exist, so there is nothing to delete.
  if (z.uuid().safeParse(params.id).success) await gmail.deleteKeyword(params.id);
});
