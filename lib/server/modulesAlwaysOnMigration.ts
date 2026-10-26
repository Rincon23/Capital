import { eq } from 'drizzle-orm';
import type { ModuleFlags } from '../budget/types';
import { HOME_WIDGET_KEYS, MODULE_KEYS, resolveHomePages } from '../modules';
import { budgetSettings, jobRuns, user } from './db/schema';
import type { Database } from './db/types';
import { homeTemplate, homeTemplateEmail } from './homeTemplate';

/**
 * Brings every account over to the app without module switches (every module on, but the
 * restricted ones). Two one-off steps, each with its row in `job_runs` as the marker:
 *
 * 1. **The Início stays as it was.** With every module on, the widgets of the modules someone had
 *    off would come into their Início by themselves. Before that, each account's Início is saved
 *    exactly as it shows today, and everything else goes to the widget tray.
 * 2. **Everyone gets the template's Início** (lib/server/homeTemplate.ts: the template account's,
 *    or the owner's while there is none), once — the owner's choice; afterwards each person
 *    changes and removes what they want. Not the owner's own Início nor the template's. Without
 *    any template yet (no `OWNER_EMAIL`), this waits for a later start.
 *
 * The switches themselves are written by `syncModules`, which runs on every start right after.
 */

export const MODULES_ALWAYS_ON_JOB = 'modules-always-on';
export const HOME_TEMPLATE_RESET_JOB = 'home-template-reset';

export interface ModulesAlwaysOnResult {
  /** Accounts whose Início was saved as it showed. */
  frozen: number;
  /** Accounts that got the template's Início. */
  reset: number;
}

async function mark(db: Database, name: string, now: Date): Promise<boolean> {
  const marked = await db
    .insert(jobRuns)
    .values({ name, lastRunAt: now })
    .onConflictDoNothing()
    .returning({ name: jobRuns.name });
  return marked.length > 0;
}

export async function runModulesAlwaysOnMigration(
  db: Database,
  now: Date = new Date(),
): Promise<ModulesAlwaysOnResult> {
  const frozen = (await mark(db, MODULES_ALWAYS_ON_JOB, now)) ? await freezeHomes(db) : 0;
  const reset = await resetHomesToTemplate(db, now);
  if (frozen > 0 || reset > 0) {
    console.info(
      `[módulos] todos ligados: ${frozen} Início(s) guardada(s) como estavam, ` +
        `${reset} com a Início do modelo.`,
    );
  }
  return { frozen, reset };
}

async function freezeHomes(db: Database): Promise<number> {
  const rows = await db
    .select({
      userId: budgetSettings.userId,
      modules: budgetSettings.modules,
      dismissedNotices: budgetSettings.dismissedNotices,
      homePages: budgetSettings.homePages,
      homeOrder: budgetSettings.homeOrder,
      homeHidden: budgetSettings.homeHidden,
    })
    .from(budgetSettings);
  for (const row of rows) {
    // The switches as they were saved until now, when absent meant off.
    const before = Object.fromEntries(MODULE_KEYS.map((key) => [key, row.modules[key] === true])) as unknown as ModuleFlags;
    const pages = resolveHomePages({
      modules: before,
      dismissedNotices: row.dismissedNotices,
      homePages: row.homePages,
      homeOrder: row.homeOrder,
      homeHidden: row.homeHidden,
    });
    const shown = new Set(pages.flat());
    await db
      .update(budgetSettings)
      .set({ homePages: pages, homeOrder: null, homeHidden: HOME_WIDGET_KEYS.filter((key) => !shown.has(key)) })
      .where(eq(budgetSettings.userId, row.userId));
  }
  return rows.length;
}

async function resetHomesToTemplate(db: Database, now: Date): Promise<number> {
  const template = await homeTemplate(db);
  if (!template || !(await mark(db, HOME_TEMPLATE_RESET_JOB, now))) return 0;
  const keep = new Set([process.env.OWNER_EMAIL?.trim().toLowerCase(), homeTemplateEmail()]);
  const rows = await db
    .select({ userId: budgetSettings.userId, email: user.email })
    .from(budgetSettings)
    .innerJoin(user, eq(user.id, budgetSettings.userId));
  let reset = 0;
  for (const row of rows) {
    if (keep.has(row.email.toLowerCase())) continue;
    await db
      .update(budgetSettings)
      .set({
        homePages: template.homePages,
        homeOrder: null,
        homeHidden: template.homeHidden,
        homeCardSizes: template.homeCardSizes,
      })
      .where(eq(budgetSettings.userId, row.userId));
    reset += 1;
  }
  return reset;
}
