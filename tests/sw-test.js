// 서비스 워커 로직 테스트 (가짜 캐시·네트워크): node tests/sw-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ORIGIN = 'https://jini-82.github.io/trip-planner/';
const listeners = {};
const store = new Map(); // cacheName → Map(url → body)
let online = true, fetched = [];
const root = path.join(__dirname, '..');

class Res { constructor(body, ok=true){ this.body=body; this.ok=ok; this.type='basic'; } clone(){ return new Res(this.body, this.ok); } }
const caches = {
  async open(name){ if(!store.has(name)) store.set(name, new Map()); const m = store.get(name);
    return { async addAll(list){ for(const u of list){ const p = new URL(u, ORIGIN).pathname.replace('/trip-planner/','') || 'index.html';
               if(!fs.existsSync(path.join(root, p))) throw new Error('없는 파일: '+p); m.set(new URL(u, ORIGIN).href, new Res('file:'+p)); } },
             async put(req, res){ m.set(req.url, res); },
             async match(req){ const u = typeof req==='string' ? new URL(req, ORIGIN).href : req.url.split('?')[0]; return m.get(u); } }; },
  async keys(){ return [...store.keys()]; }, async delete(k){ return store.delete(k); }
};
const sandbox = {
  self: { addEventListener:(t,f)=>listeners[t]=f, location:{origin:'https://jini-82.github.io'}, skipWaiting:async()=>{}, clients:{claim:async()=>{}} },
  caches, URL, Promise, setTimeout, clearTimeout, console,
  fetch: async (req) => { fetched.push(req.url); if(!online) throw new Error('offline'); return new Res('net:'+req.url); }
};
vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'), sandbox);

async function fire(type, extra){ let p; const e = Object.assign({ waitUntil:x=>p=x, respondWith:x=>p=x }, extra); listeners[type](e); return p ? await p : undefined; }
const req = (u, mode='no-cors') => ({ url: new URL(u, ORIGIN).href, method:'GET', mode });
(async () => {
  const ok = (cond, msg) => { console.log((cond?'✅ ':'❌ ')+msg); if(!cond) process.exitCode = 1; };
  store.set('jplanner-shell-v0', new Map());
  await fire('install');
  ok(store.get('jplanner-shell-v1').size > 20, '설치: 앱 파일 '+store.get('jplanner-shell-v1').size+'개 저장 (목록의 파일이 모두 존재)');
  await fire('activate');
  ok(!store.has('jplanner-shell-v0'), '활성화: 옛 캐시 삭제');
  let r = await fire('fetch', { request: req('js/state.js') });
  ok(r.body.startsWith('net:'), '온라인: 네트워크에서 최신 파일');
  online = false;
  r = await fire('fetch', { request: req('js/state.js?v=2') });
  ok(r && r.body.startsWith('net:'), '오프라인: 저장본으로 응답 (마지막으로 받은 것)');
  r = await fire('fetch', { request: req('trip/123', 'navigate') });
  ok(r && r.body==='file:index.html', '오프라인 페이지 이동: index.html로 대체');
  fetched = [];
  const g = listeners.fetch({ request:{ url:'https://maps.googleapis.com/maps/api/js', method:'GET' }, respondWith:()=>{ throw new Error('가로챔'); } });
  ok(fetched.length===0, '구글 지도 요청은 가로채지 않음');
})();
