"use strict";

/* ---------- 오버뷰(지도) — 구글맵 ----------
 * 좌표는 앱 안에서 [lat, lng] 배열로 다루고, 구글에 넘길 때만 {lat, lng}로 바꾼다.
 * 다크/라이트는 지도를 만들 때만 정할 수 있어서, 모드가 바뀌면 지도를 새로 만든다. */
var mapScheme = null;   // 지금 지도의 'dark' | 'light'

function mapMessage(msg){
  var el = document.getElementById('map');
  el.innerHTML = '<div class="map-msg">'+escapeHtml(msg)+'</div>';
}

async function ensureMap(){
  var g = await loadGoogleMaps();
  var scheme = isDarkNow() ? 'dark' : 'light';
  if(mapObj && mapScheme===scheme) return mapObj;
  // 처음이거나 화면 모드가 바뀜 → 새로 만든다
  clearMapLayers();
  var el = document.getElementById('map');
  el.innerHTML = '';
  mapObj = new g.Map(el, {
    center: {lat:35.68, lng:139.76}, zoom: 12,
    mapId: GOOGLE_MAP_ID || 'DEMO_MAP_ID',
    colorScheme: scheme==='dark' ? g.ColorScheme.DARK : g.ColorScheme.LIGHT,
    disableDefaultUI: true, zoomControl: true, clickableIcons: false,
    gestureHandling: 'greedy'
  });
  mapScheme = scheme;
  return mapObj;
}

function clearMapLayers(){
  mapLayers.markers.forEach(function(m){ m.map = null; });
  mapLayers.markers=[];
  if(mapLayers.routeSolid){ mapLayers.routeSolid.setMap(null); mapLayers.routeSolid=null; }
  if(mapLayers.routeDashed){ mapLayers.routeDashed.setMap(null); mapLayers.routeDashed=null; }
  if(mapLayers.char){ mapLayers.char.map = null; mapLayers.char=null; }
}
var ovItemsCache = [];
var ovRouteCoords = []; // 전체 경로 [lat,lng] 리스트 (구글 경로 또는 직선)
var ovSegRanges = []; // 각 아이템 사이 route coords index 구간 (구간 i의 startIdx = 구간 i-1의 endIdx)
var ovLastKey = null;  // 마지막으로 그린 여행id|날짜
var ovBuildToken = 0;  // 경로 요청이 겹칠 때 늦게 온 옛 결과를 버리기 위한 번호

// i번째 일정이 ovRouteCoords에서 몇 번째 점인지
function nodeIdx(i){
  if(i<=0 || !ovSegRanges.length) return 0;
  var seg = ovSegRanges[Math.min(i, ovSegRanges.length)-1];
  return seg.endIdx;
}

function setOvEmpty(name, meta){
  document.getElementById('ovCurrentName').textContent = name;
  document.getElementById('ovCurrentMeta').textContent = meta;
  document.getElementById('ovProgressBar').style.width='0%';
  document.getElementById('ovProgressLabel').textContent='오늘의 여정 0/0';
}

async function renderOverview(trip){
  if(!trip) return;
  var token = ++ovBuildToken;
  var items = sortedItems(trip, selectedDay).filter(function(i){ return i.lat!=null && i.lng!=null; });
  ovItemsCache = items;
  // 여행이나 날짜가 바뀌면 첫 일정부터 다시 시작
  var key = trip.id+'|'+selectedDay;
  if(key!==ovLastKey){ ovIndex = 0; ovLastKey = key; }
  if(ovIndex>=items.length) ovIndex = Math.max(0, items.length-1);
  ovRouteCoords = []; ovSegRanges = [];

  if(!hasMapsKey()){
    clearMapLayers(); mapObj = null;
    mapMessage('구글 지도 키가 아직 없어요. js/config.js에 키를 넣으면 지도가 보여요.');
    if(items.length) updateOverviewPanel(); else setOvEmpty('일정이 없어요', '');
    return;
  }
  try{ await ensureMap(); }
  catch(e){
    console.warn('구글 지도 불러오기 실패', e);
    mapObj = null; mapMessage('지도를 불러오지 못했어요. 인터넷 연결이나 API 키 설정을 확인해주세요.');
    return;
  }
  if(token!==ovBuildToken) return;
  clearMapLayers();
  // 좌표 없는 옛 일정은 검색어로 한 번 찾아본다 (찾으면 다시 그림)
  geocodeMissing(trip, selectedDay);

  if(items.length===0){
    setOvEmpty('좌표가 있는 일정이 없어요', '일정에 장소를 검색해서 고르면 지도에 표시돼요');
    return;
  }

  var bounds = new gmaps.LatLngBounds();
  items.forEach(function(it, idx){
    var el = document.createElement('div');
    el.className = 'pin-wrap';
    el.innerHTML = '<div class="pin-num"><span>'+(idx+1)+'</span></div><div class="pin-label">'+escapeHtml(it.time)+' · '+escapeHtml(it.name)+'</div>';
    var m = new gmaps.AdvancedMarkerElement({map:mapObj, position:{lat:it.lat, lng:it.lng}, content:el, gmpClickable:true, zIndex:10+idx});
    m.addEventListener('gmp-click', function(){ jumpToItemCard(it.id); });
    mapLayers.markers.push(m);
    bounds.extend({lat:it.lat, lng:it.lng});
  });
  if(items.length>1) mapObj.fitBounds(bounds, 48);
  else { mapObj.setCenter({lat:items[0].lat, lng:items[0].lng}); mapObj.setZoom(15); }

  // 경로 받기 전에도 핀·캐릭터는 바로 보이게
  updateOverviewPanel();
  buildRouteAndShow(trip, items, token);
}

async function buildRouteAndShow(trip, items, token){
  if(items.length<2){
    if(items.length===1) ovRouteCoords=[[items[0].lat,items[0].lng]];
    updateOverviewPanel();
    return;
  }
  var routeCoords = [], segRanges = [];
  for(var i=0;i<items.length-1;i++){
    var segCoords = await getSegmentPath(trip, items[i], items[i+1]);
    if(token!==ovBuildToken) return; // 그 사이 다른 날/여행으로 바뀜
    // 구간 시작점 = 앞 구간의 끝점(공유). 중복 좌표는 한 번만 넣는다
    var startIdx = i>0 ? routeCoords.length-1 : 0;
    if(i>0) segCoords = segCoords.slice(1);
    routeCoords = routeCoords.concat(segCoords);
    segRanges.push({from:i, to:i+1, startIdx:startIdx, endIdx:routeCoords.length-1});
  }
  // 애니메이션 중이면 끝날 때까지 기다렸다 반영
  while(ovAnimating){ await new Promise(function(r){ setTimeout(r, 100); }); if(token!==ovBuildToken) return; }
  ovRouteCoords = routeCoords;
  ovSegRanges = segRanges;
  updateOverviewPanel();
}

// 실선/점선은 한 번 만든 선을 재사용하고 path만 바꾼다 (애니메이션 중 매 프레임 호출)
function drawRouteLines(splitIdx){
  if(!mapObj) return;
  if(ovRouteCoords.length<2){
    if(mapLayers.routeSolid) mapLayers.routeSolid.setPath([]);
    if(mapLayers.routeDashed) mapLayers.routeDashed.setPath([]);
    return;
  }
  if(!mapLayers.routeSolid){
    mapLayers.routeSolid = new gmaps.Polyline({map:mapObj, strokeColor:cssVar('--route'), strokeWeight:4, strokeOpacity:.9, clickable:false, zIndex:2});
    mapLayers.routeDashed = new gmaps.Polyline({map:mapObj, strokeOpacity:0, clickable:false, zIndex:1,
      icons:[{icon:{path:'M 0,-1 0,1', strokeOpacity:.9, strokeColor:cssVar('--route-rest'), scale:2}, offset:'0', repeat:'10px'}]});
  }
  var splitPoint = splitIdx==null ? 0 : splitIdx;
  var solid = ovRouteCoords.slice(0, splitPoint+1);
  var dashed = ovRouteCoords.slice(splitPoint);
  mapLayers.routeSolid.setPath(solid.length>1 ? solid.map(toLL) : []);
  mapLayers.routeDashed.setPath(dashed.length>1 ? dashed.map(toLL) : []);
}

function jumpToItemCard(id){
  switchPage('schedule');
  setTimeout(function(){
    var card = document.querySelector('.itemcard[data-id="'+id+'"]');
    if(card){ card.scrollIntoView({behavior:'smooth', block:'center'}); card.classList.add('flash'); setTimeout(function(){card.classList.remove('flash');}, 1200); }
  }, 100);
}

function updateOverviewPanel(){
  var items = ovItemsCache;
  if(!items.length) return;
  var it = items[ovIndex];
  document.getElementById('ovCurrentName').textContent = it.time+' · '+it.name;
  var cat = CATS[it.cat]||CATS['기타'];
  document.getElementById('ovCurrentMeta').textContent = cat.emoji+' '+it.cat + (it.move? ' · '+(MOVES[it.move]||'')+' '+it.move : '');
  document.getElementById('ovProgressBar').style.width = ((ovIndex+1)/items.length*100)+'%';
  document.getElementById('ovProgressLabel').textContent = '오늘의 여정 '+(ovIndex+1)+'/'+items.length;
  drawRouteLines(nodeIdx(ovIndex)); // 지나온 길 실선 / 남은 길 점선
  showCharacterAt(ovIndex);
}

function charContent(move, walking){
  var el = document.createElement('div');
  el.className = 'char-wrap';
  el.innerHTML = charSvg(move, walking);
  return el;
}

function showCharacterAt(idx){
  if(!mapObj) return;
  if(mapLayers.char){ mapLayers.char.map = null; mapLayers.char=null; }
  var it = ovItemsCache[idx];
  if(!it) return;
  mapLayers.char = new gmaps.AdvancedMarkerElement({map:mapObj, position:{lat:it.lat, lng:it.lng}, content:charContent(it.move,false), zIndex:1000});
}

function charSvg(move, walking){
  var cls = walking ? 'chwrap walk' : 'chwrap';
  if(move==='택시'){
    return '<svg width="34" height="34" viewBox="0 0 34 34"><g class="'+cls+'"><rect x="6" y="16" width="22" height="9" rx="3" fill="#e0a94e"/><rect x="10" y="10" width="14" height="8" rx="2" fill="#e0a94e"/><circle cx="11" cy="26" r="3" fill="#1c2733"/><circle cx="23" cy="26" r="3" fill="#1c2733"/></g></svg>';
  }
  if(move==='기차'||move==='지하철'){
    return '<svg width="34" height="34" viewBox="0 0 34 34"><g class="'+cls+'"><rect x="7" y="8" width="20" height="16" rx="4" fill="#3f7cb0"/><rect x="10" y="12" width="6" height="6" fill="#eaf2fa"/><rect x="18" y="12" width="6" height="6" fill="#eaf2fa"/><circle cx="12" cy="26" r="2.5" fill="#1c2733"/><circle cx="22" cy="26" r="2.5" fill="#1c2733"/></g></svg>';
  }
  if(move==='트램'){
    return '<svg width="34" height="34" viewBox="0 0 34 34"><g class="'+cls+'"><rect x="6" y="10" width="22" height="13" rx="3" fill="#d9724a"/><rect x="9" y="13" width="6" height="6" fill="#fff"/><rect x="19" y="13" width="6" height="6" fill="#fff"/><circle cx="11" cy="26" r="2.5" fill="#1c2733"/><circle cx="23" cy="26" r="2.5" fill="#1c2733"/></g></svg>';
  }
  if(move==='항공'){
    return '<svg width="34" height="34" viewBox="0 0 34 34"><g class="'+cls+'"><path d="M17 5 L21 17 L30 20 L30 22 L21 20 L19 28 L23 30 L23 31 L17 30 L11 31 L11 30 L15 28 L13 20 L4 22 L4 20 L13 17 Z" fill="#1b4b7a"/></g></svg>';
  }
  // 도보/버스/자전거/기타 → 걷는 사람
  return '<svg width="34" height="34" viewBox="0 0 34 34"><g class="'+cls+'">'+
    '<circle cx="17" cy="7" r="4" fill="#d9724a"/>'+
    '<rect x="13" y="11" width="8" height="11" rx="3" fill="#3f7cb0"/>'+
    '<rect class="leg leg1" x="14" y="21" width="3" height="9" fill="#1c2733"/>'+
    '<rect class="leg leg2" x="18" y="21" width="3" height="9" fill="#1c2733"/>'+
    '</g></svg>';
}

function animateBetween(fromIdx, toIdx){
  if(ovAnimating || !mapObj) return;
  var items = ovItemsCache;
  var a = items[fromIdx], b = items[toIdx];
  if(!a || !b){ ovIndex=toIdx; updateOverviewPanel(); return; }
  // 여러 칸을 건너뛰어도(지금 버튼) 사이 구간을 모두 따라 이동
  var hasRoute = ovSegRanges.length && ovRouteCoords.length;
  var p0 = nodeIdx(fromIdx), p1 = nodeIdx(toIdx);
  var coords;
  if(hasRoute){
    coords = p0<=p1 ? ovRouteCoords.slice(p0, p1+1) : ovRouteCoords.slice(p1, p0+1).reverse();
  } else {
    coords = [[a.lat,a.lng],[b.lat,b.lng]];
  }
  var distKm = distanceKm([a.lat,a.lng],[b.lat,b.lng]);
  var duration = Math.max(1600, Math.min(4000, 1600 + distKm*300));
  ovAnimating = true;
  if(mapLayers.char){ mapLayers.char.map = null; }
  mapLayers.char = new gmaps.AdvancedMarkerElement({map:mapObj, position:toLL(coords[0]), content:charContent(b.move,true), zIndex:1000});
  var startTime = null;
  var token = ovBuildToken;
  var lastPan = 0;
  function step(ts){
    // 애니메이션 중 지도를 다시 그렸으면(날짜 전환·좌표 갱신 등) 여기서 멈춘다
    if(token!==ovBuildToken || !mapLayers.char){ ovAnimating=false; return; }
    if(!startTime) startTime = ts;
    var t = Math.min(1, (ts-startTime)/duration);
    var pos = pointAlong(coords, t);
    mapLayers.char.position = toLL(pos);
    if(ts-lastPan>300 && !nearCenter(pos)){ mapObj.panTo(toLL(pos)); lastPan = ts; }
    // 캐릭터 위치까지 실선 (앞으로 가든 뒤로 가든 같은 규칙)
    if(hasRoute) drawRouteLines(Math.round(p0 + (p1-p0)*t));
    if(t<1){ requestAnimationFrame(step); }
    else{
      ovAnimating=false;
      ovIndex=toIdx;
      updateOverviewPanel();
    }
  }
  requestAnimationFrame(step);
}
// 화면 가장자리 15% 안쪽에 있으면 true (밖이면 지도가 캐릭터를 따라간다)
function nearCenter(pos){
  var bnd = mapObj.getBounds();
  if(!bnd) return true;
  var ne = bnd.getNorthEast(), sw = bnd.getSouthWest();
  var padLat = (ne.lat()-sw.lat())*0.15, padLng = (ne.lng()-sw.lng())*0.15;
  return pos[0] < ne.lat()-padLat && pos[0] > sw.lat()+padLat && pos[1] < ne.lng()-padLng && pos[1] > sw.lng()+padLng;
}
function pointAlong(coords, t){
  if(coords.length<2) return coords[0];
  var idxF = t*(coords.length-1);
  var i0 = Math.floor(idxF), i1=Math.min(coords.length-1, i0+1);
  var f = idxF-i0;
  var p0=coords[i0], p1=coords[i1];
  return [p0[0]+(p1[0]-p0[0])*f, p0[1]+(p1[1]-p0[1])*f];
}

document.getElementById('ovPrev').addEventListener('click', function(){
  if(ovAnimating || ovIndex<=0) return;
  animateBetween(ovIndex, ovIndex-1);
});
document.getElementById('ovNext').addEventListener('click', function(){
  if(ovAnimating || ovIndex>=ovItemsCache.length-1) return;
  animateBetween(ovIndex, ovIndex+1);
});
document.getElementById('ovNow').addEventListener('click', function(){
  if(ovAnimating || !ovItemsCache.length) return;
  var now = new Date();
  var nowStr = pad(now.getHours())+':'+pad(now.getMinutes());
  var idx = 0;
  for(var i=0;i<ovItemsCache.length;i++){ if(ovItemsCache[i].time<=nowStr) idx=i; }
  if(idx===ovIndex){ showCharacterAt(idx); return; }
  animateBetween(ovIndex, idx);
});
