import type { AdminOverview } from '@/lib/admin/types';
import { listUsers } from '@/lib/server/adminRepository';
import { getDb } from '@/lib/server/db';
import { apiRoute, HttpError } from '@/lib/server/http';
import { loadGuardSnapshot } from '@/lib/server/loadGuard';

/**
 * Administração: how the server is doing and every account, with its VIP status. Only for the
 * owner (OWNER_EMAIL); for anyone else this address does not exist.
 */
export const GET = apiRoute(async ({ access }): Promise<AdminOverview> => {
  if (!(await access()).owner) throw new HttpError(404, 'NOT_FOUND', 'Não encontrado.');
  return { status: loadGuardSnapshot(), users: await listUsers(getDb()) };
});
