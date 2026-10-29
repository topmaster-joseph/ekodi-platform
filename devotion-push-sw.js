/* EKODI devotional Web Push service worker: notification display only.
 * Registration and server-side subscription storage are separate components.
 */
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { return; }
    const allowed = {
      mission: '/ekodimission/devotion',
      church: '/ekodichurch/devotion'
    };
    const site = data.site;
    if (!Object.prototype.hasOwnProperty.call(allowed, site)) return;
    const date = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : '';
    await self.registration.showNotification('오늘의 매일묵상', {
      body: '오늘의 말씀을 확인하세요.',
      icon: '/favicon.ico',
      tag: 'devotion-' + site + '-' + date,
      data: { url: allowed[site] }
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification?.data?.url;
    if (url !== '/ekodimission/devotion' && url !== '/ekodichurch/devotion') return;
    const clientsList = await clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clientsList) {
      if (new URL(client.url).pathname === url) { await client.focus(); return; }
    }
    await clients.openWindow(url);
  })());
});
