import { eq } from 'drizzle-orm';
import type { FeatureAnnouncement } from '../notifications/announcements';
import { jobRuns, user } from './db/schema';
import type { Database } from './db/types';
import { sendUserNotification } from './notify';

const ANNOUNCEMENTS_JOB = 'announcements';
/** Announcements change rarely; checking once an hour is plenty and keeps this cheap. */
const ANNOUNCEMENTS_EVERY_MS = 60 * 60 * 1000;

/**
 * Notifies every account that existed before a feature shipped, so it hears about it once,
 * through the bell (and a push, unless "Novidades do app" is off). Accounts created after
 * `publishedAt` never get it — their app was already born with that feature, nothing about it
 * is news to them. Idempotent: each (user, announcement) pair is recorded once (see
 * `sendUserNotification`'s `sourceKey`), so running this again only catches new accounts or new
 * announcements.
 */
export async function runAnnouncementsJob(
  db: Database,
  announcements: FeatureAnnouncement[],
  now: Date = new Date(),
): Promise<{ notified: number }> {
  if (announcements.length === 0) return { notified: 0 };
  const [row] = await db.select().from(jobRuns).where(eq(jobRuns.name, ANNOUNCEMENTS_JOB));
  if (row && now.getTime() - row.lastRunAt.getTime() < ANNOUNCEMENTS_EVERY_MS) return { notified: 0 };
  await db
    .insert(jobRuns)
    .values({ name: ANNOUNCEMENTS_JOB, lastRunAt: now })
    .onConflictDoUpdate({ target: jobRuns.name, set: { lastRunAt: now } });

  const accounts = await db.select({ id: user.id, createdAt: user.createdAt }).from(user);
  let notified = 0;
  for (const account of accounts) {
    for (const announcement of announcements) {
      if (account.createdAt >= new Date(announcement.publishedAt)) continue;
      const sent = await sendUserNotification(db, account.id, {
        category: 'feature',
        sourceKey: `feature:${announcement.key}`,
        message: {
          title: announcement.title,
          body: announcement.body,
          url: announcement.href ?? '/notificacoes',
        },
      });
      if (sent) notified += 1;
    }
  }
  return { notified };
}
