"use strict";

/* ---------- 오버뷰(지도) ---------- */
function ensureMap(){
  if(mapObj) return mapObj;
  mapObj = L.map('map', {zoomControl:true, attributionControl:true}).setView([35.68,139.76], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19, attribution:'&copy; OpenStreetMap'
  }).addTo(mapObj);
  return mapObj;
}
function clearMapLayers(){
  mapLayers.markers.forEach(function(m){ mapObj.removeLayer(m); });
  mapLayers.markers=[];
  if(mapLayers.routeSolid){ mapObj.removeLayer(mapLayers.routeSolid); mapLayers.routeSolid=null; }
  if(mapLayers.routeDashed){ mapObj.removeLayer(mapLayers.routeDashed); mapLayers.routeDashed=null; }
  if(mapLayers.char){ mapObj.removeLayer(mapLayers.char); mapLayers.char=null; }
}
var ovItemsCache = [];
var ovRouteCoords = []; // 전체 route latlng 리스트 (OSRM 또는 직선)
var ovSegRanges = []; // 각 아이템 사이 route coords index 구간 (구간 i의 startIdx = 구간 i-1의 endIdx)
var ovLastKey = null;  // 마지막으로 그린 여행id|날짜
var ovBuildToken = 0;  // 경로 요청이 겹칠 때 늦게 온 옛 결과를 버리기 위한 번호

// i번째 일정이 ovRouteCoords에서 몇 번째 점인지
function nodeIdx(i){
  if(i<=0 || !ovSegRanges.length) return 0;
  var seg = ovSegRanges[Math.min(i, ovSegRanges.length)-1];
  return seg.endIdx;
}

function renderOverview(trip){
  if(!trip) return;
  ensureMap();
  setTimeout(function(){ mapObj.invalidateSize(); }, 50);
  clearMapLayers();
  var items = sortedItems(trip, selectedDay).filter(function(i){ return i.lat!=null && i.lng!=null; });
  ovItemsCache = items;
  // 여행이나 날짜가 바뀌면 첫 일정부터 다시 시작
  var key = trip.id+'|'+selectedDay;
  if(key!==ovLastKey){ ovIndex = 0; ovLastKey = key; }
  if(ovIndex>=items.length) ovIndex = Math.max(0, items.length-1);
  ovBuildToken++;

  if(items.length===0){
    document.getElementById('ovCurrentName').textContent = '좌표가 있는 일정이 없어요';
    document.getElementById('ovCurrentMeta').textContent = '일정에 장소를 입력하면 지도에 표시돼요';
    document.getElementById('ovProgressBar').style.width='0%';
    document.getElementById('ovProgressLabel').textContent='오늘의 여정 0/0';
    return;
  }

  var bounds = [];
  items.forEach(function(it, idx){
    var icon = L.divIcon({html:'<div class="pin-num"><span>'+(idx+1)+'</span></div>', className:'', iconSize:[26,26], iconAnchor:[13,26]});
    var m = L.marker([it.lat,it.lng], {icon:icon}).addTo(mapObj);
    var label = L.marker([it.lat,it.lng], {
      icon: L.divIcon({html:'<div class="pin-label">'+it.time+' · '+escapeHtml(it.name)+'</div>', className:'', iconSize:[0,0], iconAnchor:[-16,-34]})
    }).addTo(mapObj);
    m.on('click', function(){ jumpToItemCard(it.id); });
    mapLayers.markers.push(m); mapLayers.markers.push(label);
    bounds.push([it.lat,it.lng]);
  });
  if(bounds.length>1) mapObj.fitBounds(bounds, {padding:[36,36]});
  else mapObj.setView(bounds[0], 15);

  buildRouteAndShow(items);
}

async function buildRouteAndShow(items){
  var token = ovBuildToken;
  ovRouteCoords = [];
  ovSegRanges = [];
  if(items.length<2){
    if(items.length===1) ovRouteCoords=[[items[0].lat,items[0].lng]];
    updateOverviewPanel();
    return;
  }
  var routeCoords = [], segRanges = [];
  for(var i=0;i<items.length-1;i++){
    var a=items[i], b=items[i+1];
    var segCoords = null;
    try{
      var url = 'https://router.project-osrm.org/route/v1/driving/'+a.lng+','+a.lat+';'+b.lng+','+b.lat+'?overview=full&geometries=geojson';
      var res = await fetch(url);
      var data = await res.json();
      if(data && data.routes && data.routes[0]){
        segCoords = data.routes[0].geometry.coordinates.map(function(c){return [c[1],c[0]];});
      }
    }catch(e){ console.warn('OSRM 실패, 직선 대체', e); }
    if(token!==ovBuildToken) return; // 그 사이 다른 날/여행으로 바뀜
    if(!segCoords) segCoords = [[a.lat,a.lng],[b.lat,b.lng]];
    // 구간 시작점 = 앞 구간의 끝점(공유). 중복 좌표는 한 번만 넣는다
    var startIdx = i>0 ? routeCoords.length-1 : 0;
    if(i>0) segCoords = segCoords.slice(1);
    routeCoords = routeCoords.concat(segCoords);
    segRanges.push({from:i, to:i+1, startIdx:startIdx, endIdx:routeCoords.length-1});
  }
  ovRouteCoords = routeCoords;
  ovSegRanges = segRanges;
  updateOverviewPanel();
}

function segRangeForIndex(idx){
  return ovSegRanges[idx] || null;
}

function drawRouteLines(splitIdx){
  if(mapLayers.routeSolid){ mapObj.removeLayer(mapLayers.routeSolid); mapLayers.routeSolid=null; }
  if(mapLayers.routeDashed){ mapObj.removeLayer(mapLayers.routeDashed); mapLayers.routeDashed=null; }
  if(ovRouteCoords.length<2) return;
  var splitPoint = splitIdx==null ? 0 : splitIdx;
  var solid = ovRouteCoords.slice(0, splitPoint+1);
  var dashed = ovRouteCoords.slice(splitPoint);
  if(solid.length>1) mapLayers.routeSolid = L.polyline(solid, {color:'#1b4b7a', weight:4, opacity:.9}).addTo(mapObj);
  if(dashed.length>1) mapLayers.routeDashed = L.polyline(dashed, {color:'#9aa7b2', weight:3, dashArray:'2,8', opacity:.85}).addTo(mapObj);
}

function jumpToItemCard(id){
  switchPage('schedule');
  document.getElementById('tabSchedule').click();
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

function showCharacterAt(idx){
  if(mapLayers.char){ mapObj.removeLayer(mapLayers.char); mapLayers.char=null; }
  var it = ovItemsCache[idx];
  if(!it) return;
  var icon = L.divIcon({html: charSvg(it.move,false), className:'', iconSize:[34,34], iconAnchor:[17,30]});
  mapLayers.char = L.marker([it.lat,it.lng], {icon:icon, zIndexOffset:1000}).addTo(mapObj);
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
  if(ovAnimating) return;
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
  var distKm = mapObj.distance([a.lat,a.lng],[b.lat,b.lng])/1000;
  var duration = Math.max(1600, Math.min(4000, 1600 + distKm*300));
  ovAnimating = true;
  if(mapLayers.char){ mapObj.removeLayer(mapLayers.char); }
  var icon = L.divIcon({html: charSvg(b.move,true), className:'', iconSize:[34,34], iconAnchor:[17,30]});
  mapLayers.char = L.marker(coords[0], {icon:icon, zIndexOffset:1000}).addTo(mapObj);
  var startTime = null;
  var token = ovBuildToken;
  function step(ts){
    // 애니메이션 중 지도를 다시 그렸으면(날짜 전환·좌표 갱신 등) 여기서 멈춘다
    if(token!==ovBuildToken || !mapLayers.char){ ovAnimating=false; return; }
    if(!startTime) startTime = ts;
    var t = Math.min(1, (ts-startTime)/duration);
    var pos = pointAlong(coords, t);
    mapLayers.char.setLatLng(pos);
    if(!mapObj.getBounds().pad(-0.15).contains(pos)){ mapObj.panTo(pos, {animate:true, duration:0.3}); }
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
