const VERSION='russki-signature-full-2026-10-11-v3';
const ASSETS=['./','./index.html','./styles.css','./lessons.js','./accents.js','./extra.js','./bonus.js','./app.js','./recordings.json','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('russki-')&&x!==VERSION).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin||new URL(e.request.url).pathname.includes('/api/'))return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(VERSION).then(cache=>cache.put(e.request,copy)).catch(()=>{})}return resp}).catch(()=>caches.match('./index.html'))))});
