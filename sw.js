/* Service worker для Magyar szavak.

   Стратегия — network-first с откатом в кэш:
   пока интернет есть, всегда отдаём свежую версию (значит, обычный git push
   доезжает до телефона без плясок с версиями кэша), а когда его нет — отдаём
   последнюю сохранённую. Именно это делает приложение работоспособным
   в метро и в самолёте.

   Запросы к Firebase и Google Translate не трогаем вовсе: они кросс-доменные
   и кэшировать их незачем. */

const CACHE = 'hu-words-v1';
const ASSETS = [
  './',
  './index.html',
  './words.js',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

// Сколько ждём сеть на переходе, прежде чем показать кэш.
// Без этого при «интернет есть, но не работает» экран висит бесконечно.
const NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(request, timeoutMs){
  const network = fetch(request).then(response => {
    if(response && response.ok){
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  });
  if(!timeoutMs) return network;
  return Promise.race([
    network,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
  ]);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;   // Firebase, Google Translate — мимо

  const isNavigation = request.mode === 'navigate';

  event.respondWith(
    fromNetwork(request, isNavigation ? NAV_TIMEOUT_MS : 0)
      .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
  );
});
