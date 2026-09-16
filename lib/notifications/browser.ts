import type { PushSubscriptionInput } from './types';

/**
 * Browser side of Web Push: the permission, the service worker and this browser's
 * subscription. Client Components only (not exported from the index, which the server uses).
 */

export type PushSupport =
  /** Notifications can be turned on here. */
  | 'supported'
  /** iPhone/iPad in the browser: only the app installed on the home screen gets notifications. */
  | 'ios-install'
  | 'unsupported';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    return 'supported';
  }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia('(display-mode: standalone)').matches;
  return ios && !installed ? 'ios-install' : 'unsupported';
}

/** The user said no (or blocked the site): only the browser's own settings can undo it. */
export class NotificationsBlockedError extends Error {
  constructor() {
    super('As notificações estão bloqueadas para o Capital neste navegador.');
    this.name = 'NotificationsBlockedError';
  }
}

/**
 * The service worker that shows notifications. Production already registers /sw.js on start;
 * `next dev` registers a no-cache variant only when notifications are turned on.
 */
async function notificationWorker(): Promise<ServiceWorkerRegistration> {
  const url = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js?dev=1';
  await navigator.serviceWorker.register(url);
  return navigator.serviceWorker.ready;
}

/** This browser's current subscription, without asking for anything. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Asks for permission (call it straight from a tap: browsers only show the prompt then) and
 * subscribes this browser with the server's key.
 */
export async function subscribeThisBrowser(publicKey: string): Promise<PushSubscriptionInput> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') throw new NotificationsBlockedError();
  if (permission !== 'granted') {
    throw new Error('Você fechou o pedido de permissão. Toque em "Ativar" de novo para permitir.');
  }

  const registration = await notificationWorker();
  let subscription = await registration.pushManager.getSubscription();
  // Subscribed with another key (the server's keys were replaced): that one can never receive.
  if (subscription && !sameKey(subscription.options.applicationServerKey, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
    } catch (err) {
      // "Registration failed - push service error": the browser could not reach its push service.
      if (!(err instanceof DOMException)) throw err;
      throw new Error(
        (await isBrave())
          ? 'O Brave vem com as notificações push desligadas. Abra brave://settings/privacy, ative "Usar os serviços do Google para mensagens push", reinicie o Brave e toque em "Ativar" de novo.'
          : 'O navegador não conseguiu se registrar no serviço de notificações. Tente de novo em instantes; se continuar, use o Chrome.',
      );
    }
  }
  return subscriptionInput(subscription);
}

async function isBrave(): Promise<boolean> {
  const brave = (navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } }).brave;
  return (await brave?.isBrave().catch(() => false)) ?? false;
}

export async function unsubscribeThisBrowser(): Promise<void> {
  await (await currentSubscription())?.unsubscribe();
}

export function subscriptionInput(subscription: PushSubscription): PushSubscriptionInput {
  const { keys } = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' },
  };
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function sameKey(key: ArrayBuffer | null, publicKey: string): boolean {
  if (!key) return false;
  const a = new Uint8Array(key);
  const b = base64UrlToBytes(publicKey);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

const ENDPOINT_KEY = 'capital:push-endpoint';

/**
 * The endpoint this browser last registered with the server. Browsers may renew a
 * subscription at any time; comparing with this on start tells the app when to re-send it.
 */
export function rememberedEndpoint(): string | null {
  try {
    return localStorage.getItem(ENDPOINT_KEY);
  } catch {
    return null;
  }
}

export function rememberEndpoint(endpoint: string | null): void {
  try {
    if (endpoint) localStorage.setItem(ENDPOINT_KEY, endpoint);
    else localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    // Private mode or blocked storage: the service worker's own renewal still covers it.
  }
}
