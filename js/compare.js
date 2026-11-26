"use strict";

/* ---------- 비교 탭: 계획 vs 실제 ----------
 * 자동 매칭: 같은 날, 200m 안. 가장 가까운 쌍부터 1:1로 짝짓는다.
 *   계획대로 방문 = 짝 있음 / 미방문 = 짝 없는 계획 / 즉흥 방문 = 짝 없는 실제 방문
 * 시간 비교는 둘 다 '현지 시각(분)'으로 한다 (계획 it.time, 실제 v.time). */
var MATCH_M = 200;

function timeMin(t){ var p=(t||'00:00').split(':'); return (+p[0])*60 + (+p[1]); }
function minToTime(m){ m = Math.max(0, Math.round(m)); return pad(Math.floor(m/60)%24)+':'+pad(m%60); }

function matchDay(trip, day){
  var items = sortedItems(trip, day);
  var withLoc = items.filter(function(i){ return i.lat!=null && i.lng!=null; });
  var noLoc = items.filter(function(i){ return i.lat==null || i.lng==null; });
  var visits = visitsOfDay(trip, day).filter(hasLoc);
  var cands = [];
  withLoc.forEach(function(it){
    visits.forEach(function(v){
      var d = distM(it, v);
      if(d <= MATCH_M) cands.push({item:it, visit:v, dist:d});
    });
  });
  cands.sort(function(a,b){ return a.dist-b.dist; });
  var usedI = {}, usedV = {}, pairs = [];
  cands.forEach(function(c){
    if(usedI[c.item.id] || usedV[c.visit.id]) return;
    usedI[c.item.id] = usedV[c.visit.id] = true;
    c.diffMin = timeMin(c.visit.time) - timeMin(c.item.time);
    pairs.push(c);
  });
  pairs.sort(function(a,b){ return a.item.time.localeCompare(b.item.time); });
  return {
    pairs: pairs,
    missed: withLoc.filter(function(i){ return !usedI[i.id]; }),
    impromptu: visits.filter(function(v){ return !usedV[v.id]; }),
    noLoc: noLoc, planCount: withLoc.length, visitCount: visits.length
  };
}

function matchTrip(trip){
  var t = {matched:0, planCount:0, visitCount:0, impromptu:0};
  dateRange(trip.start, trip.end).forEach(function(d){
    var m = matchDay(trip, d);
    t.matched += m.pairs.length; t.planCount += m.planCount; t.visitCount += m.visitCount; t.impromptu += m.impromptu.length;
  });
  return t;
}

function diffText(min){
  if(Math.abs(min) < 10) return '거의 제시간';
  var a = Math.abs(min), s = a>=60 ? Math.floor(a/60)+'시간'+(a%60 ? ' '+(a%60)+'분' : '') : a+'분';
  return s+(min>0 ? ' 늦게' : ' 일찍');
}

/* --- 화면 --- */
function renderCompare(trip){
  if(!trip) return;
  renderCmpTrip(trip);
  var m = matchDay(trip, selectedDay);
  renderCmpDay(trip, m);
  renderCmpMap(trip, m);
}

function renderCmpTrip(trip){
  var t = matchTrip(trip);
  var el = document.getElementById('cmpTrip');
  if(!t.visitCount){
    el.innerHTML = '<div class="cmp-title">이번 여행 스타일</div><div class="cmp-sub">실제 탭에서 방문을 기록하면 계획파인지 즉흥파인지 알려줘요</div>';
    return;
  }
  var plan = Math.round(t.matched / t.visitCount * 100), free = 100 - plan;
  var who = plan>=70 ? '🗓 철저한 계획파' : plan>=40 ? '⚖️ 계획 반 즉흥 반' : '✨ 자유로운 즉흥파';
  el.innerHTML = '<div class="cmp-title">이번 여행 스타일 · <b>'+who+'</b></div>'+
    '<div class="cmp-bar"><i class="p" style="width:'+plan+'%"></i><i class="f" style="width:'+free+'%"></i></div>'+
    '<div class="cmp-legend"><span class="p">계획파 '+plan+'%</span><span class="f">즉흥파 '+free+'%</span></div>'+
    '<div class="cmp-sub">계획 '+t.planCount+'곳 중 '+t.matched+'곳 방문 · 즉흥 방문 '+t.impromptu+'곳</div>';
}

function renderCmpDay(trip, m){
  var visits = visitsOfDay(trip, selectedDay);
  var html = '<div class="sectiontitle">⚖️ '+niceDate(selectedDay)+' 요약</div>';
  if(!m.planCount && !m.visitCount && !m.noLoc.length){
    document.getElementById('cmpDay').innerHTML = html + '<div class="emptyday">이 날은 계획도 실제 기록도 없어요</div>';
    return;
  }
  html += '<div class="cmp-daycard">'+
    '<div><b>'+m.pairs.length+'</b><span>계획대로</span></div>'+
    '<div><b>'+m.missed.length+'</b><span>미방문</span></div>'+
    '<div><b>'+m.impromptu.length+'</b><span>즉흥</span></div>'+
    (visits.length ? '<div><b>'+visits[0].time+'</b><span>~ '+visits[visits.length-1].time+'</span></div>' : '')+
  '</div>';
  function row(cls, icon, title, sub, lat, lng){
    return '<button class="cmp-row '+cls+'" data-lat="'+lat+'" data-lng="'+lng+'"><span class="ic">'+icon+'</span>'+
      '<span class="t"><b>'+escapeHtml(title)+'</b><span>'+escapeHtml(sub)+'</span></span></button>';
  }
  if(m.pairs.length){
    html += '<div class="cmp-h">✅ 계획대로 방문</div>';
    m.pairs.forEach(function(p){
      html += row('ok', '✅', p.item.name, '계획 '+p.item.time+' → 실제 '+p.visit.time+' · '+diffText(p.diffMin), p.visit.lat, p.visit.lng);
    });
  }
  if(m.missed.length){
    html += '<div class="cmp-h">❌ 미방문</div>';
    m.missed.forEach(function(i){ html += row('miss', '❌', i.name, '계획 '+i.time, i.lat, i.lng); });
  }
  if(m.impromptu.length){
    html += '<div class="cmp-h">✨ 즉흥 방문</div>';
    m.impromptu.forEach(function(v){
      var idx = visits.indexOf(v);
      html += row('free', '✨', visitLabel(v, idx), '실제 '+v.time+(v.photos.length ? ' · 사진 '+v.photos.length+'장' : ''), v.lat, v.lng);
    });
  }
  if(m.noLoc.length){
    html += '<div class="cmp-h">📍 위치 없는 계획 (비교에서 빠짐)</div>';
    m.noLoc.forEach(function(i){ html += '<div class="cmp-row none"><span class="ic">·</span><span class="t"><b>'+escapeHtml(i.name)+'</b><span>계획 '+i.time+' · 장소를 검색해서 고르면 비교돼요</span></span></div>'; });
  }
  var wrap = document.getElementById('cmpDay');
  wrap.innerHTML = html;
  wrap.querySelectorAll('button.cmp-row').forEach(function(b){
    b.addEventListener('click', function(){
      if(!cmpMap) return;
      cmpMap.panTo({lat:+b.getAttribute('data-lat'), lng:+b.getAttribute('data-lng')}); cmpMap.setZoom(16);
      document.getElementById('mapCompare').scrollIntoView({behavior:'smooth', block:'center'});
    });
  });
}

/* --- 겹쳐 보는 지도 --- */
var cmpMap = null, cmpMapScheme = null, cmpToken = 0;
var cmpLayers = {markers:[], lines:[], me:null, ghost:null};
var cmpPaths = {plan:null, actual:null}; // 리플레이용 {pts:[[lat,lng]], nodes:[{min, idx}]}

function clearCmpLayers(){
  stopReplay(true);
  cmpLayers.markers.forEach(function(m){ m.map = null; });
  cmpLayers.lines.forEach(function(l){ l.setMap(null); });
  if(cmpLayers.me) cmpLayers.me.map = null;
  if(cmpLayers.ghost) cmpLayers.ghost.map = null;
  cmpLayers = {markers:[], lines:[], me:null, ghost:null};
}

async function ensureCmpMap(){
  var g = await loadGoogleMaps();
  var scheme = isDarkNow() ? 'dark' : 'light';
  if(cmpMap && cmpMapScheme===scheme) return cmpMap;
  clearCmpLayers();
  var el = document.getElementById('mapCompare');
  el.innerHTML = '';
  cmpMap = new g.Map(el, {
    center:{lat:35.68, lng:139.76}, zoom:12, mapId: GOOGLE_MAP_ID || 'DEMO_MAP_ID',
    colorScheme: scheme==='dark' ? g.ColorScheme.DARK : g.ColorScheme.LIGHT,
    disableDefaultUI:true, zoomControl:true, clickableIcons:false, gestureHandling:'greedy'
  });
  cmpMapScheme = scheme;
  return cmpMap;
}

// 지점 목록 → 경로 점들과 각 지점이 몇 번째 점인지
async function buildTimedPath(trip, list, segFn){
  var pts = [], nodes = [];
  for(var i=0;i<list.length;i++){
    if(i===0){ pts.push([list[0].lat, list[0].lng]); }
    else {
      var seg = await segFn(trip, list[i-1], list[i]);
      pts = pts.concat(seg.slice(1));
    }
    nodes.push({min: timeMin(list[i].time), idx: pts.length-1});
  }
  return {pts:pts, nodes:nodes};
}

async function renderCmpMap(trip, m){
  var token = ++cmpToken;
  var bar = document.getElementById('replayBar');
  if(!hasMapsKey()){
    clearCmpLayers(); cmpMap = null;
    document.getElementById('mapCompare').innerHTML = '<div class="map-msg">구글 지도 키가 아직 없어요. js/config.js에 키를 넣으면 지도와 리플레이가 보여요.</div>';
    bar.classList.add('hide');
    return;
  }
  try{ await ensureCmpMap(); }
  catch(e){
    console.warn('구글 지도 불러오기 실패', e); cmpMap = null;
    document.getElementById('mapCompare').innerHTML = '<div class="map-msg">'+escapeHtml(mapFailMsg())+'</div>';
    bar.classList.add('hide');
    return;
  }
  if(token!==cmpToken) return;
  clearCmpLayers();
  var plan = sortedItems(trip, selectedDay).filter(function(i){ return i.lat!=null && i.lng!=null; });
  var actual = visitsOfDay(trip, selectedDay).filter(hasLoc);
  bar.classList.toggle('hide', !(plan.length || actual.length));
  document.getElementById('rpClock').textContent = '--:--';
  if(!plan.length && !actual.length) return;

  var bounds = new gmaps.LatLngBounds();
  function pin(p, idx, cls){
    var el = document.createElement('div');
    el.className = 'pin-wrap '+cls;
    el.innerHTML = '<div class="pin-num"><span>'+(idx+1)+'</span></div>';
    cmpLayers.markers.push(new gmaps.AdvancedMarkerElement({map:cmpMap, position:{lat:p.lat, lng:p.lng}, content:el, zIndex:cls==='actual'?20:10}));
    bounds.extend({lat:p.lat, lng:p.lng});
  }
  plan.forEach(function(p, i){ pin(p, i, 'plan'); });
  actual.forEach(function(v, i){ pin(v, i, 'actual'); });
  if(plan.length + actual.length > 1) cmpMap.fitBounds(bounds, 48);
  else { cmpMap.setCenter(bounds.getCenter()); cmpMap.setZoom(15); }

  var pp = await buildTimedPath(trip, plan, getSegmentPath);
  if(token!==cmpToken) return;
  var ap = await buildTimedPath(trip, actual, visitSegmentPath);
  if(token!==cmpToken) return;
  cmpPaths = {plan:pp, actual:ap};
  if(pp.pts.length>1){
    cmpLayers.lines.push(new gmaps.Polyline({map:cmpMap, path:pp.pts.map(toLL), strokeOpacity:0, clickable:false, zIndex:1,
      icons:[{icon:{path:'M 0,-1 0,1', strokeOpacity:.9, strokeColor:cssVar('--route'), scale:2}, offset:'0', repeat:'10px'}]}));
  }
  if(ap.pts.length>1){
    cmpLayers.lines.push(new gmaps.Polyline({map:cmpMap, path:ap.pts.map(toLL), strokeColor:cssVar('--actual'), strokeWeight:4, strokeOpacity:.9, clickable:false, zIndex:2}));
  }
}

/* --- 하루 리플레이: 실제 캐릭터 + 계획 유령 캐릭터 --- */
var REPLAY_MS = 15000;
var replay = null; // {start, end, t0, elapsed, raf, playing}

// 경로 위에서 시각 min의 위치 (첫 지점 전엔 첫 지점, 마지막 뒤엔 마지막 지점)
function posAt(path, min){
  var n = path.nodes;
  if(!n.length) return null;
  if(min <= n[0].min) return path.pts[n[0].idx];
  if(min >= n[n.length-1].min) return path.pts[n[n.length-1].idx];
  for(var i=0;i<n.length-1;i++){
    if(min >= n[i].min && min <= n[i+1].min){
      var span = n[i+1].min - n[i].min;
      var f = span>0 ? (min - n[i].min)/span : 1;
      return pointAlong(path.pts.slice(n[i].idx, n[i+1].idx+1), f);
    }
  }
  return path.pts[n[n.length-1].idx];
}

function replayRange(){
  var mins = [];
  [cmpPaths.plan, cmpPaths.actual].forEach(function(p){ if(p && p.nodes.length){ mins.push(p.nodes[0].min, p.nodes[p.nodes.length-1].min); } });
  if(!mins.length) return null;
  var s = Math.min.apply(null, mins), e = Math.max.apply(null, mins);
  if(e - s < 30) e = s + 30;
  return {start:s, end:e};
}

function replayCharacters(min){
  function place(key, path, move, ghost){
    var p = path && posAt(path, min);
    if(!p){ return; }
    if(!cmpLayers[key]){
      var el = document.createElement('div');
      el.className = 'char-wrap'+(ghost ? ' ghost' : '');
      el.innerHTML = charSvg(move, true);
      cmpLayers[key] = new gmaps.AdvancedMarkerElement({map:cmpMap, position:toLL(p), content:el, zIndex:ghost?900:1000});
    } else cmpLayers[key].position = toLL(p);
  }
  place('ghost', cmpPaths.plan, '도보', true);
  place('me', cmpPaths.actual, '도보', false);
  document.getElementById('rpClock').textContent = minToTime(min);
}

function startReplay(){
  if(!cmpMap) return;
  var r = replayRange();
  if(!r){ toast('리플레이할 일정이 없어요'); return; }
  if(!replay || replay.done){ replay = {start:r.start, end:r.end, elapsed:0}; }
  replay.playing = true; replay.t0 = null;
  document.getElementById('rpPlay').textContent = '⏸';
  var token = cmpToken;
  function step(ts){
    if(!replay || !replay.playing || token!==cmpToken) return;
    if(replay.t0==null) replay.t0 = ts - replay.elapsed;
    replay.elapsed = ts - replay.t0;
    var f = Math.min(1, replay.elapsed / REPLAY_MS);
    replayCharacters(replay.start + (replay.end - replay.start)*f);
    if(f<1) replay.raf = requestAnimationFrame(step);
    else { replay.playing = false; replay.done = true; document.getElementById('rpPlay').textContent = '▶'; }
  }
  replay.raf = requestAnimationFrame(step);
}
function pauseReplay(){
  if(!replay) return;
  replay.playing = false;
  if(replay.raf) cancelAnimationFrame(replay.raf);
  document.getElementById('rpPlay').textContent = '▶';
}
function stopReplay(silent){
  if(replay && replay.raf) cancelAnimationFrame(replay.raf);
  replay = null;
  if(cmpLayers.me){ cmpLayers.me.map = null; cmpLayers.me = null; }
  if(cmpLayers.ghost){ cmpLayers.ghost.map = null; cmpLayers.ghost = null; }
  var b = document.getElementById('rpPlay'); if(b) b.textContent = '▶';
  if(!silent) document.getElementById('rpClock').textContent = '--:--';
}
document.getElementById('rpPlay').addEventListener('click', function(){
  if(replay && replay.playing) pauseReplay(); else startReplay();
});
document.getElementById('rpStop').addEventListener('click', function(){ stopReplay(false); });
