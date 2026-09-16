// Capital reads and writes budget data through its own API (/api/*, same origin). This
// service worker keeps the app shell (HTML/JS/CSS) available offline, and lets every
// /api/* request go straight to the network (see the check below), so no stale data is
// ever served. With no connection the app shell still loads but stays on "Carregando…"
// until the network returns.
//
// It also shows the push notifications (reminders) and runs their buttons.
const CACHE_VERSION = 'capital-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = ['/', '/manifest.json', OFFLINE_URL, '/icon-192.png', '/icon-512.png'];

// `next dev` registers this file as /sw.js?dev=1, only to test notifications: no caching there,
// because dev assets change on every save.
const DEV = new URL(self.location.href).searchParams.has('dev');

self.addEventListener('install', (event) => {
  if (DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => DEV || (key !== STATIC_CACHE && key !== RUNTIME_CACHE))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (DEV) return;
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Data and auth: always the network, never a cached copy.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Next.js static assets are content-hashed and immutable: safe to cache-first forever.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? (await caches.match(OFFLINE_URL));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await networkPromise) ?? Response.error();
}

// ---------------------------------------------------------------------------
// Notifications. The server sends a `PushMessage` (lib/notifications/types.ts) as JSON.
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  event.waitUntil(showNotification(event.data));
});

async function showNotification(data) {
  let message = null;
  try {
    message = data ? data.json() : null;
  } catch {
    message = { body: data.text() };
  }
  message = message || {};
  const actions = Array.isArray(message.actions) ? message.actions : [];

  await self.registration.showNotification(message.title || 'Capital', {
    body: message.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: message.tag,
    // A notification that replaces another with the same tag still rings.
    renotify: Boolean(message.tag),
    timestamp: Date.now(),
    actions: actions.map(({ action, title }) => ({ action, title })),
    data: { url: message.url || '/', actions },
  });
}

self.addEventListener('notificationclick', (event) => {
  const { notification } = event;
  const data = notification.data || {};
  notification.close();

  const action = event.action ? (data.actions || []).find((a) => a.action === event.action) : null;
  event.waitUntil(action ? runAction(action, data.url) : openApp(data.url || '/'));
});

/** A button such as "Realizado ✅": done in the background, without opening the app. */
async function runAction(action, fallbackUrl) {
  try {
    const response = await fetch(action.endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action.body || {}),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch {
    // Offline, or the link expired: open the app, where the same button is on screen.
    await openApp(fallbackUrl || '/');
  }
}

/** Focuses the app if it is already open (on the notification's page), or opens it. */
async function openApp(url) {
  const target = new URL(url, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (open) {
    try {
      const focused = await open.focus();
      await focused.navigate(target);
      return;
    } catch {
      // A window this worker does not control cannot be navigated; open a new one instead.
    }
  }
  await self.clients.openWindow(target);
}

/**
 * The browser renewed the subscription (it may do so at any time): tell the server, or the
 * reminders would stop reaching this device. The app also re-sends it every time it starts.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(resubscribe(event.oldSubscription, event.newSubscription));
});

async function resubscribe(previous, current) {
  let subscription = current;
  if (!subscription) {
    const response = await fetch('/api/v1/push', { credentials: 'same-origin' });
    if (!response.ok) return;
    const { publicKey } = await response.json();
    if (!publicKey) return;
    subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });
  }
  await fetch('/api/v1/push/devices', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...subscription.toJSON(),
      previousEndpoint: previous ? previous.endpoint : undefined,
    }),
  });
}

function base64UrlToBytes(value) {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
