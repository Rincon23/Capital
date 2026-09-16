/**
 * Runs once when the Next.js server starts: brings the database schema up to date before
 * the first request, then starts the background jobs (reminder notifications and quotes, see
 * lib/server/scheduler.ts). In production a failed migration stops the server (the container
 * restarts and the error shows in its logs) instead of serving requests against an outdated
 * schema.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL) return;

  const { runMigrations } = await import('./lib/server/db/migrate');
  try {
    await runMigrations();
  } catch (err) {
    console.error('[db] falha ao aplicar as migrações:', err);
    if (process.env.NODE_ENV === 'production') throw err;
  }

  const [{ startScheduler }, { getDb }] = await Promise.all([
    import('./lib/server/scheduler'),
    import('./lib/server/db'),
  ]);
  startScheduler(getDb);
}
