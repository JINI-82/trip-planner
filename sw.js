/* J플래너 서비스 워커 — 오프라인에서도 앱과 기록을 볼 수 있게 앱 파일을 저장해 둔다.
 * 전략: 같은 사이트 파일은 '네트워크 먼저, 안 되면 저장본' (온라인이면 항상 최신).
 *       구글 지도 등 다른 사이트 요청은 건드리지 않는다 (저장 안 함).
 * 앱 파일 목록(SHELL)이 바뀌면 CACHE 이름의 숫자를 올린다. */
const CACHE = 'jplanner-shell-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'vendor/exifr.lite.umd.js',
  'js/config.js', 'js/maps.js', 'js/db.js', 'js/state.js', 'js/util.js', 'js/schedule.js',
  'js/sheets.js', 'js/backup.js', 'js/theme.js', 'js/ics.js', 'js/routes.js', 'js/places.js',
  'js/overview.js', 'js/visits.js', 'js/actual.js', 'js/compare.js', 'js/memory.js',
  'js/share.js', 'js/pwa.js', 'js/alarm.js', 'js/main.js'
];
const NET_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('jplanner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(req){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT);
    fetch(req).then((res) => { clearTimeout(t); resolve(res); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 구글 지도 등은 그대로 통과
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fromNetwork(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
