/**
 * Runs once when the Next.js server starts: brings the database schema up to date before
 * the first request. In production a failure stops the server (the container restarts and
 * the error shows in its logs) instead of serving requests against an outdated schema.
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
}
