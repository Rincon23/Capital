/** What the service worker shows. Built on the server, sent encrypted through Web Push. */
export interface PushMessage {
  title: string;
  body: string;
  /** Page opened when the notification itself is tapped. */
  url: string;
  /**
   * Notifications with the same tag replace each other instead of piling up (the 12:00 reminder
   * replaces the 08:00 one).
   */
  tag?: string;
  /** Buttons under the notification (Android). iOS ignores them; the screen has the same action. */
  actions?: PushAction[];
}

export interface PushAction {
  /** Identifier the service worker receives when this button is tapped. */
  action: string;
  title: string;
  /** Called (POST, JSON `body`) by the service worker, without opening the app. */
  endpoint: string;
  body?: Record<string, unknown>;
}

/** A device that receives this user's notifications, as listed in Settings. */
export interface PushDevice {
  id: string;
  /** The push service address; the browser compares it to its own to find "este aparelho". */
  endpoint: string;
  /** "Chrome no Android". */
  label: string;
  createdAt: string;
  lastSuccessAt: string | null;
}

/** The outcome of sending one message to a user's devices. */
export interface PushSendReport {
  /** Devices the push service accepted the message for. */
  sent: number;
  /** Subscriptions the push service said are gone (404/410), now deleted. */
  removed: number;
  /** Other failures (network, 5xx); the subscription is kept for the next try. */
  failed: number;
}

/** The browser's `PushSubscription.toJSON()`, as sent to the API. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** The endpoint this one replaces, when the browser rotated the subscription. */
  previousEndpoint?: string;
}
