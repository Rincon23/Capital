import { z } from 'zod';
import { probeCreateItem, probeCredentials, probeDeleteItem, probeItem } from '@/lib/server/banks/probe';
import { apiRoute, HttpError, readJson } from '@/lib/server/http';
import { allowAttempt } from '@/lib/server/rateLimit';

/**
 * F0 of the Open Finance module: tries Pluggy's API with credentials the person types on the
 * test page, and answers only the shape of what came back (see lib/server/banks/probe.ts).
 * Development and VIP only. Nothing is stored and nothing is logged.
 */
const probeSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().trim().min(1).max(500),
  action: z.enum(['check', 'create', 'inspect', 'delete']),
  itemId: z.uuid().optional(),
  redirectUri: z
    .url({ protocol: /^https$/ })
    .max(500)
    .optional(),
});

export const POST = apiRoute(async ({ request, access, userId }) => {
  if (process.env.NODE_ENV !== 'development') {
    throw new HttpError(404, 'NOT_FOUND', 'Página não encontrada.');
  }
  if (!(await access()).vip) {
    throw new HttpError(403, 'VIP_ONLY', 'Open Finance é só para contas VIP.');
  }
  if (!allowAttempt(`banks-probe:${userId}`, 30, 10 * 60_000)) {
    throw new HttpError(429, 'RATE_LIMITED', 'Muitos testes seguidos. Espere alguns minutos.');
  }
  const { clientId, clientSecret, action, itemId, redirectUri } = await readJson(request, probeSchema);
  const credentials = { clientId, clientSecret };
  const returnTo = redirectUri ?? 'https://capital.rincon.dev.br/';

  switch (action) {
    case 'check':
      return { steps: await probeCredentials(credentials, returnTo) };
    case 'create':
      return probeCreateItem(credentials, { redirectUri: returnTo, clientUserId: userId });
    case 'inspect':
    case 'delete': {
      if (!itemId) throw new HttpError(400, 'INVALID_INPUT', 'Falta o id da conexão.');
      const steps =
        action === 'inspect'
          ? await probeItem(credentials, itemId)
          : await probeDeleteItem(credentials, itemId);
      return { steps };
    }
  }
});
