/* 개발 테스트용: GPS·촬영시간·시간대가 든 가짜 JPEG를 브라우저에서 만든다.
 * 사용: 콘솔에서 await import('/tests/fake-photos.js') 후 window.makeJpeg(...)
 *   makeJpeg('p1.jpg', {taken:'2026:12:03 10:00:00', offset:'+08:00', lat:22.27, lng:114.15,
 *                       gpsDate:'2026:12:03', gpsTime:[2,0,0]}, '#d9724a') → File
 * 앱에는 포함되지 않는다. */
function makeExif(o){
  const entries = {ifd0:[], exif:[], gps:[]};
  const ascii = s => { const b=new TextEncoder().encode(s+'\0'); return {type:2, count:b.length, bytes:b}; };
  const rat = arr => { const b=new Uint8Array(arr.length*8); const dv=new DataView(b.buffer); arr.forEach((v,i)=>{ dv.setUint32(i*8, Math.round(v*1000), true); dv.setUint32(i*8+4, 1000, true); }); return {type:5, count:arr.length, bytes:b}; };
  const dms = d => { d=Math.abs(d); const deg=Math.floor(d), m=Math.floor((d-deg)*60), s=((d-deg)*60-m)*60; return [deg,m,s]; };
  if(o.taken) entries.exif.push([0x9003, ascii(o.taken)]);
  if(o.offset) entries.exif.push([0x9011, ascii(o.offset)]);
  if(o.lat!=null){
    entries.gps.push([0x0001, ascii(o.lat>=0?'N':'S')]); entries.gps.push([0x0002, rat(dms(o.lat))]);
    entries.gps.push([0x0003, ascii(o.lng>=0?'E':'W')]); entries.gps.push([0x0004, rat(dms(o.lng))]);
    if(o.gpsTime){ entries.gps.push([0x0007, rat(o.gpsTime)]); entries.gps.push([0x001D, ascii(o.gpsDate)]); }
  }
  entries.ifd0.push([0x010F, ascii('Apple')]);
  const ifdSize = n => 2 + n*12 + 4;
  const n0 = entries.ifd0.length + 2, ne = entries.exif.length, ng = entries.gps.length;
  const off0 = 8, offE = off0+ifdSize(n0), offG = offE+ifdSize(ne); let dataOff = offG+ifdSize(ng);
  const buf = new Uint8Array(4096); const dv = new DataView(buf.buffer);
  buf.set([0x49,0x49,0x2A,0x00]); dv.setUint32(4, 8, true);
  function writeIfd(at, list){
    list.sort((a,b)=>a[0]-b[0]);
    dv.setUint16(at, list.length, true);
    list.forEach((e,i)=>{ const p=at+2+i*12; dv.setUint16(p, e[0], true);
      if(e[1].ptr!=null){ dv.setUint16(p+2, 4, true); dv.setUint32(p+4, 1, true); dv.setUint32(p+8, e[1].ptr, true); return; }
      const v=e[1]; dv.setUint16(p+2, v.type, true); dv.setUint32(p+4, v.count, true);
      if(v.bytes.length<=4){ buf.set(v.bytes, p+8); } else { dv.setUint32(p+8, dataOff, true); buf.set(v.bytes, dataOff); dataOff += v.bytes.length + (v.bytes.length%2); } });
    dv.setUint32(at+2+list.length*12, 0, true);
  }
  writeIfd(off0, entries.ifd0.concat([[0x8769,{ptr:offE}],[0x8825,{ptr:offG}]]));
  writeIfd(offE, entries.exif); writeIfd(offG, entries.gps);
  const tiff = buf.slice(0, dataOff);
  const app1 = new Uint8Array(4+6+tiff.length); app1[0]=0xFF; app1[1]=0xE1; const len=2+6+tiff.length; app1[2]=len>>8; app1[3]=len&255;
  app1.set(new TextEncoder().encode('Exif\0\0'), 4); app1.set(tiff, 10);
  return app1;
}
async function makeJpeg(name, o, color){
  const c=document.createElement('canvas'); c.width=600; c.height=400; const x=c.getContext('2d');
  x.fillStyle=color||'#888'; x.fillRect(0,0,600,400); x.fillStyle='#fff'; x.font='60px sans-serif'; x.fillText(name,40,220);
  const blob = await new Promise(r=>c.toBlob(r,'image/jpeg',.8)); const bytes=new Uint8Array(await blob.arrayBuffer());
  const app1 = makeExif(o); const out = new Uint8Array(bytes.length+app1.length);
  out.set(bytes.slice(0,2)); out.set(app1,2); out.set(bytes.slice(2), 2+app1.length);
  return new File([out], name, {type:'image/jpeg'});
}
window.makeJpeg = makeJpeg;
// <input type=file>에 파일을 넣고 change 이벤트 발생
window.feedFiles = function(input, files){
  const dt = new DataTransfer(); files.forEach(f=>dt.items.add(f));
  input.files = dt.files; input.dispatchEvent(new Event('change'));
};
export {};
