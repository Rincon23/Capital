import { and, eq } from 'drizzle-orm';
import webpush from 'web-push';
import {
  deviceLabel,
  type PushDevice,
  type PushMessage,
  type PushSendReport,
  type PushSubscriptionInput,
} from '../notifications';
import { pushSubscriptions } from './db/schema';
import type { Database } from './db/types';
import { HttpError } from './httpError';

/**
 * Web Push with VAPID keys (the `web-push` library). No third-party account: the browser's own
 * push service (Google's for Chrome, Mozilla's, Apple's) delivers the message, encrypted for
 * that one browser. Keys come from `.env.local`: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
 * VAPID_SUBJECT (an https: or mailto: contact the push services can reach).
 */

interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { subject, publicKey, privateKey };
}

/** The key browsers subscribe with, or null while the server has no VAPID keys. */
export function pushPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

export interface SendOptions {
  /** How long the push service keeps the message for an offline device. */
  ttlSeconds?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

/** One delivery attempt; rejects with `{ statusCode }` when the push service refuses it. */
export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: SendOptions,
) => Promise<void>;

const webPushSender: PushSender = async (subscription, payload, options) => {
  const vapid = vapidConfig();
  if (!vapid) throw new PushNotConfiguredError();
  await webpush.sendNotification(subscription, payload, {
    vapidDetails: vapid,
    TTL: options.ttlSeconds ?? 4 * 60 * 60,
    urgency: options.urgency ?? 'high',
    contentEncoding: 'aes128gcm',
    timeout: 10_000,
  });
};

export class PushNotConfiguredError extends HttpError {
  constructor() {
    super(
      503,
      'PUSH_NOT_CONFIGURED',
      'As notificações ainda não foram configuradas no servidor (chaves VAPID).',
    );
  }
}

/** A 404 or 410 from the push service: the browser unsubscribed or the subscription expired. */
function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  return status === 404 || status === 410;
}

/**
 * Sends `message` to every device of `userId` (or only `deviceId`). Dead subscriptions are
 * deleted on the spot, so the list in Settings never keeps a device that stopped receiving.
 */
export async function sendPushToUser(
  db: Database,
  userId: string,
  message: PushMessage,
  options: SendOptions & { deviceId?: string; sender?: PushSender } = {},
): Promise<PushSendReport> {
  const sender = options.sender ?? webPushSender;
  const conditions = [eq(pushSubscriptions.userId, userId)];
  if (options.deviceId) conditions.push(eq(pushSubscriptions.id, options.deviceId));
  const devices = await db
    .select()
    .from(pushSubscriptions)
    .where(and(...conditions));

  const payload = JSON.stringify(message);
  const report: PushSendReport = { sent: 0, removed: 0, failed: 0 };

  await Promise.all(
    devices.map(async (device) => {
      try {
        await sender(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
          options,
        );
        report.sent += 1;
        await db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: new Date() })
          .where(eq(pushSubscriptions.id, device.id));
      } catch (err) {
        if (err instanceof PushNotConfiguredError) throw err;
        if (isGone(err)) {
          report.removed += 1;
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
        } else {
          report.failed += 1;
          console.error('[push] falha ao enviar:', (err as Error)?.message ?? err);
        }
      }
    }),
  );
  return report;
}

/** The devices of one user: subscribe, list and remove. */
export class PostgresPushRepository {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
  ) {}

  async listDevices(): Promise<PushDevice[]> {
    const rows = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, this.userId))
      .orderBy(pushSubscriptions.createdAt);
    return rows.map(toDevice);
  }

  /**
   * Saves this browser's subscription for the signed-in user. Idempotent, and also used when
   * the browser rotates a subscription (`previousEndpoint`), so the old one is dropped.
   */
  async registerDevice(input: PushSubscriptionInput, userAgent: string | null): Promise<PushDevice> {
    if (input.previousEndpoint && input.previousEndpoint !== input.endpoint) {
      await this.db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, this.userId),
            eq(pushSubscriptions.endpoint, input.previousEndpoint),
          ),
        );
    }

    const values = {
      userId: this.userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
    };
    const [row] = await this.db
      .insert(pushSubscriptions)
      .values({ endpoint: input.endpoint, ...values })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
      .returning();
    return toDevice(row);
  }

  async removeDevice(id: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, this.userId), eq(pushSubscriptions.id, id)));
  }

  /** The notification behind "Enviar notificação de teste". */
  async sendTest(deviceId?: string, sender?: PushSender): Promise<PushSendReport> {
    const devices = await this.listDevices();
    if (devices.length === 0 || (deviceId && !devices.some((d) => d.id === deviceId))) {
      throw new HttpError(
        409,
        'NO_DEVICES',
        'Nenhum aparelho recebe notificações. Ative neste aparelho primeiro.',
      );
    }
    return sendPushToUser(
      this.db,
      this.userId,
      {
        title: 'Capital',
        body: '🔔 Tudo certo! É assim que seus lembretes vão chegar.',
        url: '/configuracoes',
        tag: 'capital-teste',
      },
      { deviceId, sender, ttlSeconds: 10 * 60 },
    );
  }
}

function toDevice(row: typeof pushSubscriptions.$inferSelect): PushDevice {
  return {
    id: row.id,
    endpoint: row.endpoint,
    label: deviceLabel(row.userAgent),
    createdAt: row.createdAt.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
  };
}
