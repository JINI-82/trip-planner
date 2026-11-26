// 개발용 정적 파일 서버 (외부 패키지 없음)
//   node .claude/serve.js        → 이 PC에서만 (http://localhost:8080)
//   node .claude/serve.js --lan  → 같은 와이파이의 아이폰에서도 접속 (http://PC주소:8080)
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
const lan = process.argv.includes('--lan');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  // .git, .claude 같은 숨김 폴더·파일은 내주지 않는다
  if (p.split('/').some(s => s.startsWith('.'))) { res.writeHead(404); return res.end('not found'); }
  const file = path.join(root, p);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(8080, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log('http://localhost:8080');
  if (lan) {
    Object.values(os.networkInterfaces()).flat()
      .filter(a => a && a.family === 'IPv4' && !a.internal)
      .forEach(a => console.log(`아이폰에서: http://${a.address}:8080/photo-test.html`));
  }
});
