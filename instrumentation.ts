/**
 * Runs once when the Next.js server starts: brings the database schema up to date before
 * the first request, applies the one-off data migrations that go with it, then starts the
 * background jobs (reminder notifications and quotes, see lib/server/scheduler.ts). In
 * production a failed migration stops the server (the container restarts and the error shows in
 * its logs) instead of serving requests against an outdated schema.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // The board's temperature is watched from the start, even before anyone opens the app.
  const { startLoadGuardMonitor } = await import('./lib/server/loadGuard');
  startLoadGuardMonitor();

  if (!process.env.DATABASE_URL) return;

  const { runMigrations } = await import('./lib/server/db/migrate');
  try {
    await runMigrations();
  } catch (err) {
    console.error('[db] falha ao aplicar as migrações:', err);
    if (process.env.NODE_ENV === 'production') throw err;
  }

  const [{ startScheduler }, { getDb }, { runCardModuleMigration }, { runFixedCostLabelMigration }] =
    await Promise.all([
      import('./lib/server/scheduler'),
      import('./lib/server/db'),
      import('./lib/server/cardModuleMigration'),
      import('./lib/server/fixedCostLabelMigration'),
    ]);

  // One-off data migrations; each records that it ran and does nothing on the next start.
  try {
    await runCardModuleMigration(getDb());
  } catch (err) {
    console.error('[cartão] falha na migração do módulo único:', err);
  }

  try {
    await runFixedCostLabelMigration(getDb());
  } catch (err) {
    console.error('[categorias] falha ao renomear "Custo Fixo":', err);
  }

  startScheduler(getDb);

  // Traffic spikes, pauses and heat become notifications to the owner (OWNER_EMAIL).
  const { wireLoadGuardAlerts } = await import('./lib/server/alerts');
  wireLoadGuardAlerts(getDb);
}
