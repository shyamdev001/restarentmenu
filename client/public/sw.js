// Service worker for notifications. It receives pushes from the server (so news
// arrives even when the menu or admin tab is closed) and brings the right tab
// forward when a notification is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const isAdmin = (url) => new URL(url, self.location.origin).pathname.startsWith('/admin');
const openTabs = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

self.addEventListener('push', (event) => {
  let news = {};
  try { news = event.data.json(); } catch { /* empty push */ }
  const url = news.url || '/';

  event.waitUntil((async () => {
    // If the matching page is open and in view, it is already showing this news itself.
    const tabs = await openTabs();
    if (tabs.some((tab) => tab.visibilityState === 'visible' && isAdmin(tab.url) === isAdmin(url))) return;
    await self.registration.showNotification(news.title || 'Update', {
      body: news.body || '', tag: news.tag, renotify: !!news.tag,
      requireInteraction: !!news.requireInteraction,   // "on its way": stays until it is seen
      icon: '/icon-192.png', badge: '/icon-192.png', vibrate: news.vibrate || [120, 60, 120],
      timestamp: Date.now(), data: { url }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const tabs = await openTabs();
    const tab = tabs.find((t) => isAdmin(t.url) === isAdmin(url));
    if (!tab) return self.clients.openWindow(url);
    // The menu is still open somewhere: bring it forward and show the order there.
    tab.postMessage({ type: 'open', url });
    return tab.focus();
  })());
});

// Push addresses expire now and then. Get a new one and tell the server, so the
// guest keeps hearing about their order without opening the menu again.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const old = event.oldSubscription;
    const key = old?.options?.applicationServerKey;
    if (!old || !key) return;
    const fresh = event.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await fetch('/api/push/renew', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old: old.endpoint, subscription: fresh.toJSON() })
    });
  })().catch(() => {}));
});
