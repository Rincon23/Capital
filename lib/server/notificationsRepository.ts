import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AppNotification } from '../notifications/types';
import { notifications } from './db/schema';
import type { Database } from './db/types';

const LIST_LIMIT = 100;

/** What the bell and the Notificações screen need: the recent history and the unread count. */
export interface NotificationsSnapshot {
  notifications: AppNotification[];
  unread: number;
}

/** The signed-in user's notification history: what the bell and the Notificações screen read. */
export class PostgresNotificationsRepository {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  async list(): Promise<NotificationsSnapshot> {
    const [rows, [{ unread }]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, this.userId))
        .orderBy(desc(notifications.createdAt))
        .limit(LIST_LIMIT),
      this.db
        .select({ unread: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, this.userId), isNull(notifications.readAt))),
    ]);
    return { notifications: rows.map(toNotification), unread };
  }

  async markRead(id: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, this.userId), eq(notifications.id, id)));
  }

  async markAllRead(): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, this.userId), isNull(notifications.readAt)));
  }
}

function toNotification(row: typeof notifications.$inferSelect): AppNotification {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
