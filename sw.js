/* Service Worker fuer Web-Push (24.08.2026). BEWUSST ohne fetch-Handler und
   ohne Cache: Er existiert nur, damit Push-Nachrichten ankommen -- die App
   selbst laedt weiterhin ganz normal vom Server (ein Cache hier haette bei
   jedem Deploy eine zweite Auslieferungswahrheit geschaffen).
   Nutzlast: JSON { titel, text, url } aus backend/lib/sportPush.js. */

// Ein Zeichen je Marke: Die Datei wird auf movietaste.de UND couchultras.com
// ausgeliefert (gleicher Server, White-Label siehe backend/server.js) -- das
// Icon der Meldung richtet sich nach dem Host, unter dem abonniert wurde.
var CU = self.location.hostname.indexOf('couchultras') !== -1;
var ICON = CU ? '/cu-icon-192.png' : '/icon-192.png';

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { /* kaputte Nutzlast: Standardtexte */ }
  e.waitUntil(self.registration.showNotification(d.titel || 'CouchUltras', {
    body: d.text || '',
    icon: ICON,
    badge: ICON,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (fenster) {
    for (var i = 0; i < fenster.length; i++) {
      if ('focus' in fenster[i]) return fenster[i].focus();
    }
    return clients.openWindow(url);
  }));
});
