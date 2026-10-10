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
      icon: '/icon-192.png', badge: '/icon-192.png', vibrate: [120, 60, 120], data: { url }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const tabs = await openTabs();
    const tab = tabs.find((t) => isAdmin(t.url) === isAdmin(url));
    return tab ? tab.focus() : self.clients.openWindow(url);
  })());
});
