"use strict";

/* ---------- 실제 탭: 지도 + 방문 목록 + 구간 이동수단 ---------- */
var actMap = null, actMapScheme = null;
var actLayers = { markers:[], line:null, char:null };
var actToken = 0;
var VISIT_MOVE_ICON = {'도보':'🚶', '차량':'🚗', '항공':'✈️'};

function visitLabel(v, idx){ return v.name || ('방문 '+(idx+1)); }
function tzLabel(tz){
  var m = tzToMin(tz); if(m==null) return '';
  var h = m/60;
  return 'UTC'+(h>=0?'+':'')+(Number.isInteger(h) ? h : h.toFixed(1));
}

function clearActLayers(){
  actLayers.markers.forEach(function(m){ m.map = null; });
  actLayers.markers = [];
  if(actLayers.line){ actLayers.line.setMap(null); actLayers.line = null; }
  if(actLayers.char){ actLayers.char.map = null; actLayers.char = null; }
}

async function ensureActMap(){
  var g = await loadGoogleMaps();
  var scheme = isDarkNow() ? 'dark' : 'light';
  if(actMap && actMapScheme===scheme) return actMap;
  clearActLayers();
  var el = document.getElementById('mapActual');
  el.innerHTML = '';
  actMap = new g.Map(el, {
    center:{lat:35.68, lng:139.76}, zoom:12,
    mapId: GOOGLE_MAP_ID || 'DEMO_MAP_ID',
    colorScheme: scheme==='dark' ? g.ColorScheme.DARK : g.ColorScheme.LIGHT,
    disableDefaultUI:true, zoomControl:true, clickableIcons:false, gestureHandling:'greedy'
  });
  actMapScheme = scheme;
  return actMap;
}

// 구간 경로: 이동수단을 안 골랐으면 직선 (요청 안 함)
function visitSegmentPath(trip, a, b){
  if(!b.move) return Promise.resolve([[a.lat,a.lng],[b.lat,b.lng]]);
  return getSegmentPath(trip, a, b);
}

function renderActual(trip){
  if(!trip) return;
  var list = visitsOfDay(trip, selectedDay);
  renderActList(trip, list);
  renderActMap(trip, list);
}

/* --- 목록 --- */
function renderActList(trip, list){
  var allPhotos = list.reduce(function(n, v){ return n + v.photos.length; }, 0);
  document.getElementById('actSummary').innerHTML = list.length
    ? '👣 '+niceDate(selectedDay)+' · 방문 <b>'+list.length+'</b>곳 · 사진 <b>'+allPhotos+'</b>장'
    : '';
  var wrap = document.getElementById('actList');
  if(!list.length){
    wrap.innerHTML = '<div class="emptyday">아직 실제 방문 기록이 없어요<br>📍 위치 등록이나 🖼 사진 넣기로 남겨보세요</div>';
    return;
  }
  var html = '';
  list.forEach(function(v, idx){
    if(idx>0){
      html += '<button class="segrow" data-seg="'+v.id+'">'+
        '<span class="line"></span><span class="lbl">'+(v.move ? VISIT_MOVE_ICON[v.move]+' '+v.move : '이동수단 고르기')+' ▾</span></button>';
    }
    html += '<div class="visitcard" data-id="'+v.id+'">'+
      '<div class="vnum">'+(idx+1)+'</div>'+
      '<div class="body">'+
        '<div class="top"><span class="time">'+escapeHtml(v.time)+'</span><span class="tz">'+tzLabel(v.tz)+'</span>'+
          '<span class="name">'+escapeHtml(visitLabel(v, idx))+'</span></div>'+
        '<div class="meta">'+(v.source==='gps' ? '📍 위치 등록' : '🖼 사진 '+v.photos.length+'장')+'</div>'+
        (v.photos.length ? '<div class="thumbs">'+v.photos.slice(0,6).map(function(p){
            return '<img src="'+escapeAttr(fileUrl(p.fileId))+'" data-file="'+escapeAttr(p.fileId)+'" alt="">';
          }).join('')+(v.photos.length>6 ? '<span class="more">+'+(v.photos.length-6)+'</span>' : '')+'</div>' : '')+
        (v.memo ? '<div class="memo">'+escapeHtml(v.memo)+'</div>' : '')+
        '<div class="btns"><button data-act="vedit" data-id="'+v.id+'">✏️ 편집</button></div>'+
      '</div></div>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-seg]').forEach(function(b){ b.addEventListener('click', function(){ openSegSheet(b.getAttribute('data-seg')); }); });
  wrap.querySelectorAll('[data-act="vedit"]').forEach(function(b){ b.addEventListener('click', function(){ openVisitSheet(b.getAttribute('data-id')); }); });
  wrap.querySelectorAll('.thumbs img').forEach(function(img){ img.addEventListener('click', function(){ openFile(img.getAttribute('data-file')); }); });
}

/* --- 지도 --- */
async function renderActMap(trip, list){
  var token = ++actToken;
  if(!hasMapsKey()){
    clearActLayers(); actMap = null;
    document.getElementById('mapActual').innerHTML = '<div class="map-msg">구글 지도 키가 아직 없어요. js/config.js에 키를 넣으면 지도가 보여요.</div>';
    return;
  }
  try{ await ensureActMap(); }
  catch(e){
    console.warn('구글 지도 불러오기 실패', e); actMap = null;
    document.getElementById('mapActual').innerHTML = '<div class="map-msg">지도를 불러오지 못했어요. 인터넷 연결이나 API 키 설정을 확인해주세요.</div>';
    return;
  }
  if(token!==actToken) return;
  clearActLayers();
  if(!list.length) return;
  var bounds = new gmaps.LatLngBounds();
  list.forEach(function(v, idx){
    var el = document.createElement('div');
    el.className = 'pin-wrap actual';
    el.innerHTML = '<div class="pin-num"><span>'+(idx+1)+'</span></div><div class="pin-label">'+escapeHtml(v.time)+' · '+escapeHtml(visitLabel(v, idx))+'</div>';
    var m = new gmaps.AdvancedMarkerElement({map:actMap, position:{lat:v.lat, lng:v.lng}, content:el, gmpClickable:true, zIndex:10+idx});
    m.addEventListener('gmp-click', function(){ jumpToVisitCard(v.id); });
    actLayers.markers.push(m);
    bounds.extend({lat:v.lat, lng:v.lng});
  });
  if(list.length>1) actMap.fitBounds(bounds, 48);
  else { actMap.setCenter({lat:list[0].lat, lng:list[0].lng}); actMap.setZoom(15); }
  // 캐릭터는 마지막 방문에
  var last = list[list.length-1];
  var ch = document.createElement('div'); ch.className = 'char-wrap'; ch.innerHTML = charSvg(last.move==='차량'?'택시':last.move, false);
  actLayers.char = new gmaps.AdvancedMarkerElement({map:actMap, position:{lat:last.lat, lng:last.lng}, content:ch, zIndex:1000});

  // 실제 동선 (구간별 경로를 이어 붙임)
  var path = [];
  for(var i=0;i<list.length-1;i++){
    var seg = await visitSegmentPath(trip, list[i], list[i+1]);
    if(token!==actToken) return;
    path = path.concat(i>0 ? seg.slice(1) : seg);
  }
  if(path.length>1){
    actLayers.line = new gmaps.Polyline({map:actMap, path:path.map(toLL), strokeColor:cssVar('--actual'), strokeWeight:4, strokeOpacity:.9, clickable:false});
  }
}

function jumpToVisitCard(id){
  var card = document.querySelector('.visitcard[data-id="'+id+'"]');
  if(card){ card.scrollIntoView({behavior:'smooth', block:'center'}); card.classList.add('flash'); setTimeout(function(){ card.classList.remove('flash'); }, 1200); }
}

/* --- 구간 이동수단 시트 --- */
var editingSegId = null;
function openSegSheet(visitId){
  var trip = getTrip();
  var list = visitsOfDay(trip, selectedDay);
  var idx = list.findIndex(function(v){ return v.id===visitId; });
  if(idx<1) return;
  editingSegId = visitId;
  var v = list[idx];
  document.getElementById('segSub').textContent = visitLabel(list[idx-1], idx-1)+' → '+visitLabel(v, idx);
  var chips = document.getElementById('segChips');
  chips.innerHTML = '';
  [['도보','🚶 도보 (구글 도보 경로)'],['차량','🚗 차량 (구글 차량 경로)'],['항공','✈️ 항공 (직선)'],['','미정 (직선)']].forEach(function(o){
    var b = document.createElement('button');
    b.type='button'; b.className = 'chip'+(v.move===o[0]?' on':''); b.textContent = o[1];
    b.addEventListener('click', function(){
      v.move = o[0]; save(); closeSheet('sheetSeg'); renderActual(trip);
    });
    chips.appendChild(b);
  });
  openSheet('sheetSeg');
}
document.getElementById('segClose').addEventListener('click', function(){ closeSheet('sheetSeg'); });

/* --- 방문 편집 시트 --- */
var editingVisitId = null, pendingVisitPhotos = [];
function openVisitSheet(id){
  var trip = getTrip();
  var v = tripVisits(trip).find(function(x){ return x.id===id; });
  if(!v) return;
  editingVisitId = id;
  var idx = visitsOfDay(trip, v.day).indexOf(v);
  document.getElementById('viName').value = v.name;
  document.getElementById('viName').placeholder = visitLabel({name:''}, idx);
  document.getElementById('viDay').value = v.day;
  document.getElementById('viTime').value = v.time;
  document.getElementById('viTz').value = v.tz;
  document.getElementById('viMemo').value = v.memo || '';
  pendingVisitPhotos = v.photos.slice();
  renderVisitPhotos();
  openSheet('sheetVisit');
}
function renderVisitPhotos(){
  var wrap = document.getElementById('viPhotos');
  if(!pendingVisitPhotos.length){ wrap.innerHTML = '<span class="hint">사진 없음</span>'; return; }
  wrap.innerHTML = pendingVisitPhotos.map(function(p, i){
    return '<div class="vp"><img src="'+escapeAttr(fileUrl(p.fileId))+'" alt=""><button type="button" data-i="'+i+'">✕</button></div>';
  }).join('');
  wrap.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click', function(){ pendingVisitPhotos.splice(+b.getAttribute('data-i'), 1); renderVisitPhotos(); });
  });
}
document.getElementById('viSave').addEventListener('click', function(){
  var trip = getTrip();
  var v = tripVisits(trip).find(function(x){ return x.id===editingVisitId; });
  if(!v) return;
  var day = document.getElementById('viDay').value, time = document.getElementById('viTime').value;
  var tz = document.getElementById('viTz').value.trim();
  if(/^[+-]?\d{1,2}$/.test(tz)){ var h = parseInt(tz,10); tz = minToTz(h*60); } // '8' → '+08:00'
  if(!RE_TZ.test(tz) || Math.abs(tzToMin(tz))>14*60){ toast('시간대는 +08:00 처럼 입력해주세요'); return; }
  if(!RE_DAY.test(day) || !RE_TIME.test(time)){ toast('날짜와 시간을 입력해주세요'); return; }
  v.name = document.getElementById('viName').value.trim();
  v.day = day; v.time = time; v.tz = tz; v.ms = localToMs(day, time, tz);
  v.memo = document.getElementById('viMemo').value.trim();
  v.photos = pendingVisitPhotos.slice();
  sortVisits(trip);
  save(); closeSheet('sheetVisit'); selectedDay = dateRange(trip.start, trip.end).indexOf(day)!==-1 ? day : selectedDay; render();
  toast('방문을 저장했어요');
});
document.getElementById('viCancel').addEventListener('click', function(){ closeSheet('sheetVisit'); });
var pendingDeleteVisit = false;
document.getElementById('viDelete').addEventListener('click', function(){
  var btn = document.getElementById('viDelete');
  if(!pendingDeleteVisit){
    pendingDeleteVisit = true; btn.textContent = '한 번 더 눌러 삭제';
    setTimeout(function(){ pendingDeleteVisit = false; btn.textContent = '삭제'; }, 3000);
    return;
  }
  pendingDeleteVisit = false; btn.textContent = '삭제';
  var trip = getTrip();
  trip.visits = tripVisits(trip).filter(function(x){ return x.id!==editingVisitId; });
  save(); closeSheet('sheetVisit'); render(); toast('방문을 삭제했어요');
});
