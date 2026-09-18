import { eq } from 'drizzle-orm';
import { isNotificationCategoryOn, type NotificationCategory, type PushMessage } from '../notifications/types';
import { budgetSettings, notifications } from './db/schema';
import type { Database } from './db/types';
import { sendPushToUser, type PushSender, type SendOptions } from './push';

export interface NotifyInput {
  category: NotificationCategory;
  message: PushMessage;
  /** Dedupe key: a second call with the same (userId, sourceKey) never records or pushes again. */
  sourceKey?: string;
}

/**
 * Every notification the app generates goes through here: it is always logged to the in-app
 * bell (Central de notificações), and also pushed to the phone unless this account turned that
 * category off in Notificações. A push failure never rolls back the in-app record — the person
 * still finds it in the app even if the phone missed it. Returns whether it was newly recorded
 * (false when `sourceKey` had already been recorded for this user, so callers driving a batch —
 * e.g. one announcement to every account — can count how many were actually new).
 */
export async function sendUserNotification(
  db: Database,
  userId: string,
  input: NotifyInput,
  pushOptions?: SendOptions & { sender?: PushSender },
): Promise<boolean> {
  const recorded = await db
    .insert(notifications)
    .values({
      userId,
      category: input.category,
      title: input.message.title,
      body: input.message.body,
      href: input.message.url,
      sourceKey: input.sourceKey ?? null,
    })
    .onConflictDoNothing({ target: [notifications.userId, notifications.sourceKey] })
    .returning({ id: notifications.id });
  if (recorded.length === 0) return false;

  const [settings] = await db
    .select({ notificationPrefs: budgetSettings.notificationPrefs })
    .from(budgetSettings)
    .where(eq(budgetSettings.userId, userId));
  if (isNotificationCategoryOn(settings?.notificationPrefs, input.category)) {
    await sendPushToUser(db, userId, input.message, pushOptions);
  }
  return true;
}
