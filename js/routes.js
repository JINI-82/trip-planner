"use strict";

/* ---------- 구간 경로 (구글 Routes) + 저장 ----------
 * 구간 이동수단 = 도착 일정의 '이동 방법'.
 * 한 번 받은 경로는 trip.routes[키]에 저장해 다시 요청하지 않는다(무료 한도 절약).
 * 키에 두 좌표와 이동수단이 들어가서 장소나 이동수단이 바뀌면 저절로 새로 받는다. */
var TRAVEL_MODE = {
  '도보':'WALKING', '자전거':'BICYCLING',
  '택시':'DRIVING', '버스':'DRIVING',
  '지하철':'TRANSIT', '기차':'TRANSIT', '트램':'TRANSIT',
  '항공':null // 직선
};
function travelModeFor(move){
  if(move in TRAVEL_MODE) return TRAVEL_MODE[move];
  return 'DRIVING';
}
function routeKey(a, b){
  var mode = travelModeFor(b.move) || 'STRAIGHT';
  return mode+'|'+a.lat.toFixed(5)+','+a.lng.toFixed(5)+'|'+b.lat.toFixed(5)+','+b.lng.toFixed(5);
}

// 구간 좌표 [[lat,lng],...] 를 돌려준다. 실패하면 직선 (저장하지 않음 → 다음에 다시 시도)
async function getSegmentPath(trip, a, b){
  var straight = [[a.lat,a.lng],[b.lat,b.lng]];
  var mode = travelModeFor(b.move);
  if(!mode) return straight;
  var key = routeKey(a, b);
  trip.routes = trip.routes || {};
  if(trip.routes[key]) return trip.routes[key];
  try{
    var g = await loadGoogleMaps();
    var res = await g.Route.computeRoutes({
      origin: {lat:a.lat, lng:a.lng},
      destination: {lat:b.lat, lng:b.lng},
      travelMode: mode,
      fields: ['path']
    });
    var path = res && res.routes && res.routes[0] && res.routes[0].path;
    if(path && path.length>1){
      var pts = compactPath(path.map(function(p){ return [p.lat(), p.lng()]; }));
      // 경로 양 끝을 핀 위치에 맞춘다 (도로 위 점과 핀이 어긋나지 않게)
      pts[0] = straight[0]; pts[pts.length-1] = straight[1];
      trip.routes[key] = pts;
      save();
      return pts;
    }
  }catch(e){
    if(!(e && e.message==='NO_KEY')) console.warn('경로 요청 실패, 직선으로 표시', mode, e);
  }
  return straight;
}

// 지금 일정에 쓰이지 않는 저장 경로 정리
function pruneRouteCache(trip){
  if(!trip.routes) return;
  var used = {};
  var days = {};
  trip.items.forEach(function(it){ (days[it.day] = days[it.day]||[]).push(it); });
  Object.keys(days).forEach(function(d){
    var list = sortedItems(trip, d).filter(function(i){ return i.lat!=null && i.lng!=null; });
    for(var i=0;i<list.length-1;i++) used[routeKey(list[i], list[i+1])] = true;
  });
  Object.keys(trip.routes).forEach(function(k){ if(!used[k]) delete trip.routes[k]; });
}
