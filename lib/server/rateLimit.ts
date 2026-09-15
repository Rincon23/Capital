/**
 * Tiny in-memory fixed-window rate limiter for the auth Server Actions (the app runs as a
 * single server process). Returns false once `key` goes over `limit` hits in `windowMs`.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function allowAttempt(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    pruneExpired(now);
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function pruneExpired(now: number): void {
  if (windows.size < 1000) return;
  for (const [key, value] of windows) {
    if (value.resetAt <= now) windows.delete(key);
  }
}
