// 앱 아이콘 PNG 만들기 (외부 패키지 없음): node tests/make-icons.js
// 남색 그라데이션 바탕 + 금색 JP + 주황 점. icons/ 에 192·512·180(아이폰) 저장
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function crc32(buf){
  let c, crc = 0xffffffff;
  for(let n=0;n<buf.length;n++){
    c = (crc ^ buf[n]) & 0xff;
    for(let k=0;k<8;k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgbAt){
  const raw = Buffer.alloc((size*3+1)*size);
  for(let y=0;y<size;y++){
    raw[y*(size*3+1)] = 0;
    for(let x=0;x<size;x++){ const c = rgbAt(x, y); raw.set(c, y*(size*3+1)+1+x*3); }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4); ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level:9})), chunk('IEND', Buffer.alloc(0))]);
}
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const NAVY = hex('#1b4b7a'), NAVY2 = hex('#3f7cb0'), GOLD = hex('#e0a94e'), ORANGE = hex('#d9724a');
const mix = (a, b, t) => a.map((v,i) => Math.round(v + (b[i]-v)*t));

// 단위 좌표(0~1)에서 모양 판정 — 'JP' 두 글자 (획 두께 0.11)
const T = 0.11, TOP = 0.28, BOT = 0.72;
function inJ(u, v){
  const x1 = 0.47, x0 = x1 - T, hookY = 0.58;
  if(u>=x0 && u<=x1 && v>=TOP && v<=hookY) return true;                    // 세로 기둥
  if(u>=0.25 && u<=x1 && v>=TOP && v<=TOP+T) return true;                   // 위 가로줄
  const r = (x1 - 0.15)/2, cx = 0.15 + r, rOut = r, rIn = r - T;            // 아래 갈고리(반원)
  const d = Math.hypot(u-cx, v-hookY);
  return v>=hookY && d<=rOut && d>=rIn;
}
function inP(u, v){
  const x0 = 0.55, x1 = x0 + T, bowlB = TOP + 0.27, cx = 0.70, cy = (TOP + bowlB)/2, rOut = (bowlB - TOP)/2;
  if(u>=x0 && u<=x1 && v>=TOP && v<=BOT) return true;                       // 세로 기둥
  if(u>=x0 && u<=cx && ((v>=TOP && v<=TOP+T) || (v>=bowlB-T && v<=bowlB))) return true; // 위·아래 가로줄
  const d = Math.hypot(u-cx, v-cy);
  return u>=cx && d<=rOut && d>=rOut-T;                                     // 오른쪽 반원
}
function inDot(u, v){ return Math.hypot(u-0.83, v-0.76) <= 0.045; }

function render(size){
  const S = 4; // 4x4 슈퍼샘플링으로 가장자리 부드럽게
  return png(size, (x, y) => {
    const bg = mix(NAVY, NAVY2, (x+y)/(2*size));
    let j = 0, dot = 0;
    for(let sy=0; sy<S; sy++) for(let sx=0; sx<S; sx++){
      const u = (x + (sx+0.5)/S)/size, v = (y + (sy+0.5)/S)/size;
      if(inDot(u,v)) dot++; else if(inJ(u,v) || inP(u,v)) j++;
    }
    let c = mix(bg, GOLD, j/(S*S));
    c = mix(c, ORANGE, dot/(S*S));
    return c;
  });
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, {recursive:true});
[['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]].forEach(([name, size]) => {
  fs.writeFileSync(path.join(out, name), render(size));
  console.log(name, size);
});
