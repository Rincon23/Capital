import { withAccessRules } from '@/lib/modules';
import { apiRoute, readJson } from '@/lib/server/http';
import { backupSchema } from '@/lib/server/validation';

/** A backup of many years is a few MB; anything past this is not a backup of this app. */
const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

/** The account's full backup (the JSON "Exportar dados" downloads). */
export const GET = apiRoute(({ repo }) => repo.exportData());

/** Replaces all of the account's data with the backup. */
export const POST = apiRoute(async ({ request, repo, access }) => {
  const backup = await readJson(request, backupSchema, { maxBytes: MAX_BACKUP_BYTES });
  const { vip } = await access();
  await repo.importData({ ...backup, settings: withAccessRules(backup.settings, vip) });
});
