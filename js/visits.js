"use strict";

/* ---------- 실제 방문 만들기: 위치 등록 · 사진 넣기 ----------
 * 시간은 모두 '방문 당시 현지 시각 + 시간대'로 저장한다 (visit.day/time/tz),
 * 정렬·묶기는 UTC 밀리초(visit.ms)로 한다. */
var VISIT_NEAR_M = 100;          // 같은 방문으로 묶는 거리
var VISIT_NEAR_MS = 30*60000;    // 같은 방문으로 묶는 시간
var PLAN_MATCH_M = 200;          // 계획 일정 이름을 가져오는 거리
var THUMB_W = 400;

function tripVisits(trip){ trip.visits = trip.visits || []; return trip.visits; }
function sortVisits(trip){ tripVisits(trip).sort(function(a,b){ return a.ms-b.ms; }); }
function visitsOfDay(trip, day){ return tripVisits(trip).filter(function(v){ return v.day===day; }); }

function distM(a, b){ return distanceKm([a.lat,a.lng],[b.lat,b.lng])*1000; }

/* --- 시간대 --- */
function tzToMin(tz){
  var m = /^([+-])(\d{2}):(\d{2})$/.exec(tz||'');
  return m ? (m[1]==='-'?-1:1)*(+m[2]*60 + +m[3]) : null;
}
function minToTz(min){
  var s = min<0?'-':'+'; min = Math.abs(min);
  return s+pad(Math.floor(min/60))+':'+pad(min%60);
}
// 현지 날짜·시각 + 시간대 → UTC ms
function localToMs(day, time, tz){
  var d = day.split('-'), t = time.split(':');
  return Date.UTC(+d[0], +d[1]-1, +d[2], +t[0], +t[1], +(t[2]||0)) - (tzToMin(tz)||0)*60000;
}
// UTC ms + 시간대 → {day, time}
function msToLocal(ms, tz){
  var d = new Date(ms + (tzToMin(tz)||0)*60000);
  return { day: d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()),
           time: pad(d.getUTCHours())+':'+pad(d.getUTCMinutes()) };
}
// 경도로 대충 추정 (15도 = 1시간). 마지막 수단
function tzFromLongitude(lng){ return minToTz(Math.max(-12, Math.min(14, Math.round(lng/15)))*60); }
// 같은 여행에서 현지 시각이 가장 가까운 방문의 시간대
function tzFromNeighbors(trip, day, time){
  var target = day+' '+time, best = null, bestDiff = Infinity;
  tripVisits(trip).forEach(function(v){
    var diff = Math.abs(localToMs(v.day, v.time, '+00:00') - localToMs(day, time, '+00:00'));
    if(diff < bestDiff && diff <= 12*3600000){ best = v.tz; bestDiff = diff; }
  });
  return best;
}

/* --- 계획 일정과 이름 맞추기 --- */
function planNameNear(trip, day, lat, lng){
  var best = null, bestD = PLAN_MATCH_M;
  trip.items.forEach(function(it){
    if(it.day!==day || it.lat==null) return;
    var d = distM({lat:lat,lng:lng}, it);
    if(d <= bestD){ best = it.name; bestD = d; }
  });
  return best || '';
}

function newVisit(trip, o){
  var v = { id:uid(), day:o.day, time:o.time, tz:o.tz, ms:localToMs(o.day, o.time, o.tz),
    lat:o.lat, lng:o.lng, name: planNameNear(trip, o.day, o.lat, o.lng), memo:'', move:'', source:o.source, photos:[] };
  tripVisits(trip).push(v);
  return v;
}

/* --- 위치 등록: 지금 위치 한 번 --- */
function registerCurrentLocation(){
  var trip = getTrip();
  if(!('geolocation' in navigator)){ toast('이 브라우저는 위치를 지원하지 않아요'); return; }
  toast('현재 위치를 찾는 중…');
  navigator.geolocation.getCurrentPosition(function(pos){
    var now = new Date();
    var tz = minToTz(-now.getTimezoneOffset()); // 폰은 여행지 시간대로 맞춰져 있다
    var loc = msToLocal(now.getTime(), tz);
    var range = dateRange(trip.start, trip.end);
    if(range.indexOf(loc.day)===-1){ toast('오늘('+loc.day+')은 이 여행 기간이 아니에요'); return; }
    var near = tripVisits(trip).find(function(v){
      return hasLoc(v) && distM(v, {lat:pos.coords.latitude, lng:pos.coords.longitude}) <= VISIT_NEAR_M && Math.abs(v.ms-now.getTime()) <= VISIT_NEAR_MS;
    });
    if(near){ toast('방금 등록한 곳과 같은 장소예요'); return; }
    var v = newVisit(trip, {day:loc.day, time:loc.time, tz:tz, lat:pos.coords.latitude, lng:pos.coords.longitude, source:'gps'});
    sortVisits(trip);
    save(); selectedDay = v.day; render();
    toast('📍 '+(v.name || '현재 위치')+'를 기록했어요');
  }, function(err){
    toast(err.code===1 ? '위치 권한이 꺼져 있어요. 설정에서 허용해주세요' : '위치를 찾지 못했어요. 다시 시도해주세요');
  }, {enableHighAccuracy:true, timeout:15000, maximumAge:30000});
}

/* --- 사진 넣기 --- */
function parseExifLocal(s){
  var m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s||'');
  return m ? {day:m[1]+'-'+m[2]+'-'+m[3], time:m[4]+':'+m[5], sec:+(m[6]||0)} : null;
}
function gpsUtcMs(ds, ts){
  var d = /^(\d{4}):(\d{2}):(\d{2})/.exec(ds||'');
  if(!d || !ts || ts.length<3) return null;
  return Date.UTC(+d[1], +d[2]-1, +d[3], +ts[0], +ts[1], Math.floor(+ts[2]));
}

// 사진 한 장 → {file, key, lat, lng, day, time, tz, tzSrc, ms} (촬영시간 없으면 null)
async function readPhoto(trip, file){
  var t = {};
  try{ t = await exifr.parse(file, {tiff:true, exif:true, gps:true, reviveValues:false, translateValues:false}) || {}; }
  catch(e){ console.warn('EXIF 읽기 실패', file.name, e); }
  var loc = parseExifLocal(t.DateTimeOriginal || t.CreateDate);
  if(!loc) return null;
  var p = { file:file, key: file.name+'|'+(t.DateTimeOriginal||'')+'|'+file.size, day:loc.day, time:loc.time };
  if(typeof t.latitude==='number' && typeof t.longitude==='number'){ p.lat = t.latitude; p.lng = t.longitude; }
  // 시간대: EXIF → GPS 시각 → 같은 여행 다른 방문 → 경도
  var tz = t.OffsetTimeOriginal || t.OffsetTime;
  if(RE_TZ.test(tz||'')) p.tzSrc = 'exif';
  else {
    tz = null;
    var utc = gpsUtcMs(t.GPSDateStamp, t.GPSTimeStamp);
    if(utc!=null){
      var diff = Math.round((localToMs(loc.day, loc.time, '+00:00') + loc.sec*1000 - utc)/60000/15)*15;
      if(Math.abs(diff)<=14*60){ tz = minToTz(diff); p.tzSrc = 'gps'; }
    }
    if(!tz){ tz = tzFromNeighbors(trip, loc.day, loc.time); if(tz) p.tzSrc = 'neighbor'; }
    if(!tz && p.lat!=null){ tz = tzFromLongitude(p.lng); p.tzSrc = 'longitude'; }
    if(!tz){ tz = minToTz(-new Date().getTimezoneOffset()); p.tzSrc = 'device'; }
  }
  p.tz = tz;
  p.ms = localToMs(loc.day, loc.time, tz) + loc.sec*1000;
  return p;
}

function makeThumb(file){
  return new Promise(function(resolve){ resizeImage(file, resolve, THUMB_W, true); });
}

// 사진들을 방문으로 묶어 trip에 넣는다. 결과 통계를 돌려준다
async function importPhotos(trip, files){
  var stats = {total:files.length, added:0, newVisits:0, dup:0, noTime:0, outOfTrip:0, noGpsSkipped:0};
  var range = dateRange(trip.start, trip.end);
  var known = {};
  tripVisits(trip).forEach(function(v){ v.photos.forEach(function(p){ known[p.key] = true; }); });

  var photos = [];
  for(var i=0;i<files.length;i++){
    var p = await readPhoto(trip, files[i]);
    if(!p){ stats.noTime++; continue; }
    if(known[p.key]){ stats.dup++; continue; }
    if(range.indexOf(p.day)===-1){ stats.outOfTrip++; continue; }
    known[p.key] = true;
    photos.push(p);
  }
  photos.sort(function(a,b){ return a.ms-b.ms; });

  var created = []; // 이번에 만든 방문 (정렬 전)
  function findVisitFor(p, needDist){
    var cands = tripVisits(trip).filter(function(v){
      if(Math.abs(v.ms - p.ms) > VISIT_NEAR_MS) return false;
      if(needDist) return !hasLoc(v) || distM(v, p) <= VISIT_NEAR_M; // 위치 없는 방문(가계부)은 시간만 맞으면 OK
      return true;
    });
    cands.sort(function(a,b){ return Math.abs(a.ms-p.ms) - Math.abs(b.ms-p.ms); });
    return cands[0] || null;
  }
  async function attach(v, p){
    var blob = await makeThumb(p.file);
    if(!blob) return false;
    v.photos.push({fileId:addFile(blob), key:p.key});
    stats.added++;
    return true;
  }

  // 시간대를 경도·폰 설정으로 대충 정한 사진은, 방문이 생긴 뒤 가까운 방문 시간대로 다시 정한다
  function refineTz(p){
    if(p.tzSrc!=='longitude' && p.tzSrc!=='device') return;
    var tz = tzFromNeighbors(trip, p.day, p.time);
    if(tz && tz!==p.tz){
      p.ms += (tzToMin(p.tz) - tzToMin(tz))*60000;
      p.tz = tz; p.tzSrc = 'neighbor';
    }
  }

  // 1) 위치 있는 사진: 가까운 방문에 붙이거나 새 방문
  for(var j=0;j<photos.length;j++){
    var ph = photos[j];
    if(ph.lat==null) continue;
    refineTz(ph);
    // 시간순으로 들어오니 '마지막 사진'과의 거리·시간으로 판단 (방문 위치는 첫 사진)
    var v = null;
    var recent = created.filter(function(c){ return c._last && distM(c._last, ph)<=VISIT_NEAR_M && (ph.ms - c._last.ms)<=VISIT_NEAR_MS; });
    if(recent.length) v = recent[recent.length-1];
    if(!v) v = findVisitFor(ph, true);
    if(!v){
      v = newVisit(trip, {day:ph.day, time:ph.time, tz:ph.tz, lat:ph.lat, lng:ph.lng, source:'photo'});
      v.ms = ph.ms;
      created.push(v); stats.newVisits++;
    }
    if(!hasLoc(v)){ v.lat = ph.lat; v.lng = ph.lng; } // 가계부 방문에 사진 위치 채우기
    v._last = ph;
    await attach(v, ph);
  }
  // 2) 위치 없는 사진: 30분 안의 방문에 붙이고, 없으면 건너뜀
  for(var k=0;k<photos.length;k++){
    var q = photos[k];
    if(q.lat!=null) continue;
    refineTz(q);
    var w = findVisitFor(q, false);
    if(w) await attach(w, q); else stats.noGpsSkipped++;
  }
  // 사진 없이 끝난 방문(썸네일 실패) 제거, 임시 필드 정리
  trip.visits = tripVisits(trip).filter(function(v){ delete v._last; return v.photos.length || v.source!=='photo' || created.indexOf(v)===-1; });
  sortVisits(trip);
  return stats;
}

function photoImportMessage(s){
  var parts = ['사진 '+s.added+'장 추가'];
  if(s.newVisits) parts.push('새 방문 '+s.newVisits+'곳');
  var skip = [];
  if(s.dup) skip.push('이미 넣은 사진 '+s.dup);
  if(s.outOfTrip) skip.push('여행 기간 밖 '+s.outOfTrip);
  if(s.noTime) skip.push('촬영시간 없음 '+s.noTime);
  if(s.noGpsSkipped) skip.push('위치 없음 '+s.noGpsSkipped);
  return parts.join(' · ') + (skip.length ? ' (건너뜀: '+skip.join(', ')+'장)' : '');
}

document.getElementById('btnLocate').addEventListener('click', registerCurrentLocation);
document.getElementById('btnPhotos').addEventListener('click', function(){ document.getElementById('photoInput').click(); });
document.getElementById('photoInput').addEventListener('change', async function(e){
  var files = Array.from(e.target.files||[]);
  e.target.value = '';
  if(!files.length) return;
  var trip = getTrip();
  toast('사진 '+files.length+'장 읽는 중…');
  try{
    var s = await importPhotos(trip, files);
    save();
    // 새로 들어온 첫 방문 날짜로 이동
    if(s.added){
      var days = tripVisits(trip).map(function(v){ return v.day; });
      if(days.indexOf(selectedDay)===-1) selectedDay = days[0];
    }
    render();
    toast(photoImportMessage(s));
  }catch(err){
    console.warn('사진 넣기 실패', err);
    toast('사진을 넣지 못했어요');
  }
});
