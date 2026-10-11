/* RUSSKI SIGNATURE iPhone fix. Requests always go to Render to validate the session.
   Old offline caches are removed to avoid serving a stale login or app shell. */
const VERSION='russki-signature-ios-login-2026-10-11-v4';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(
 caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('russki-')).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
