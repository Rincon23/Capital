import { z } from 'zod';
import { effectiveModules } from '@/lib/modules';
import { getDb } from '@/lib/server/db';
import { isHomeTemplateEmail } from '@/lib/server/homeTemplate';
import { apiRoute, readJson } from '@/lib/server/http';
import { PostgresMissionsRepository } from '@/lib/server/missionsRepository';

/** The places the app says the person just went to (`visitsForPath`), for the missions done by going. */
const checkSchema = z.object({ visits: z.array(z.string().max(40)).max(20).optional() });

/**
 * Gives the XP of what the account just did and returns its missions, level and XP. The Início
 * template earns nothing: it is a tool of the owner's, not a person.
 */
export const POST = apiRoute(async ({ request, userId, email, access }) => {
  const { visits } = await readJson(request, checkSchema);
  return new PostgresMissionsRepository(getDb(), userId).check({
    modules: effectiveModules(await access()),
    visits,
    record: !isHomeTemplateEmail(email),
  });
});
