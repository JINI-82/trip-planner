"use strict";

/* ---------- 상수 ---------- */
var CATS = {
  '항공': {emoji:'✈️', color:'#2c6fb0'},
  '숙소': {emoji:'🏨', color:'#7c5cbf'},
  '식당': {emoji:'🍜', color:'#d9724a'},
  '카페': {emoji:'☕️', color:'#a9762f'},
  '명소': {emoji:'🏯', color:'#2f9e6f'},
  '이동': {emoji:'🚗', color:'#3f7cb0'},
  '쇼핑': {emoji:'🛍️', color:'#c14f7c'},
  '기타': {emoji:'📌', color:'#6b7a89'}
};
var MOVES = {
  '도보':'🚶','지하철':'🚇','버스':'🚌','트램':'🚊','기차':'🚆','택시':'🚕','항공':'✈️','자전거':'🚲'
};
var DOW = ['일','월','화','수','목','금','토'];
var LS_KEY = 'jplanner_v1';

/* ---------- 상태 ---------- */
var state = null;
var selectedDay = null;
var editingItemId = null;
var editingFlightId = null;
var editingTripId = null;
var pendingAttachments = [];
var ovIndex = 0;
var ovAnimating = false;
var mapObj = null;
var mapLayers = { markers:[], routeSolid:null, routeDashed:null, char:null };

/* ---------- 저장/로드 ---------- */
function safeLS(fn, fallback){
  try { return fn(); } catch(e){ console.warn('localStorage 오류', e); return fallback; }
}
// IndexedDB에서 읽고, 없으면 옛 localStorage 데이터를 한 번 옮겨온다 (옛 데이터는 지우지 않고 남겨둠)
async function loadState(){
  try{
    var raw = await dbGetMeta('state');
    if(typeof raw==='string'){
      var data = normalizeState(JSON.parse(raw));
      if(data) return data;
      console.warn('저장된 데이터 형식이 올바르지 않아요');
    }
  }catch(e){ console.warn('IndexedDB 읽기 오류', e); }
  var old = safeLS(function(){ return localStorage.getItem(LS_KEY); }, null);
  if(old){
    try{
      var legacy = normalizeState(JSON.parse(old));
      if(legacy){ absorbLegacyFiles(legacy); console.info('localStorage 데이터를 IndexedDB로 옮겼어요'); return legacy; }
    }catch(e){ console.warn('옛 데이터 파싱 오류', e); }
  }
  return seedData();
}

/* ---------- 데이터 검증 (불러오기·로드 공통) ---------- */
// 형식이 맞지 않으면 null. 맞으면 필드를 정리한 새 state를 돌려준다.
var RE_DAY = /^\d{4}-\d{2}-\d{2}$/;
var RE_TIME = /^\d{2}:\d{2}$/;
var RE_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
var RE_ID = /^[A-Za-z0-9_-]{1,40}$/;
var RE_DOC_DATA = /^data:(image\/[a-z0-9+.-]+|application\/pdf);base64,/i;
function str(v, max){ return typeof v==='string' ? v.slice(0, max||500) : ''; }
function num(v){ return (typeof v==='number' && isFinite(v)) ? v : null; }
// javascript:, data: 같은 위험한 링크는 버린다
function safeUrl(u){ return /^\s*(javascript|data|vbscript):/i.test(u||'') ? '' : (u||''); }
function cleanId(v){ return (typeof v==='string' && RE_ID.test(v)) ? v : uid(); }
// 저장된 구간 경로 { 'MODE|lat,lng|lat,lng': [[lat,lng],...] }
function cleanRoutes(r){
  var out = {};
  if(!r || typeof r!=='object') return out;
  Object.keys(r).forEach(function(k){
    var v = r[k];
    if(k.length>120 || !/^[A-Z]+\|-?[\d.]+,-?[\d.]+\|-?[\d.]+,-?[\d.]+$/.test(k) || !Array.isArray(v) || v.length<2 || v.length>2000) return;
    if(v.every(function(p){ return Array.isArray(p) && p.length===2 && num(p[0])!==null && num(p[1])!==null; })) out[k] = v;
  });
  return out;
}
/* 실제 방문
 * { id, day:'YYYY-MM-DD'(현지), time:'HH:MM'(현지), tz:'+08:00', ms:UTC 밀리초,
 *   lat, lng, name, memo, move:'도보'|'차량'|'항공'|'' (이 방문으로 들어온 이동수단),
 *   source:'gps'|'photo', photos:[{fileId, key}] }  key = 같은 사진 중복 방지용 */
var VISIT_MOVES = ['도보','차량','항공'];
var RE_TZ = /^[+-]\d{2}:\d{2}$/;
function cleanVisits(list){
  if(!Array.isArray(list)) return [];
  return list.filter(function(v){
    return v && typeof v==='object' && RE_DAY.test(v.day) && RE_TIME.test(v.time) && num(v.ms)!==null && ((num(v.lat)!==null && num(v.lng)!==null) || (v.lat==null && v.lng==null));
  }).map(function(v){
    return { id: cleanId(v.id), day: v.day, time: v.time, tz: RE_TZ.test(v.tz) ? v.tz : '+00:00', ms: v.ms,
      lat: num(v.lat), lng: num(v.lng), name: str(v.name,100), memo: str(v.memo,2000),
      move: VISIT_MOVES.indexOf(v.move)!==-1 ? v.move : '',
      source: v.source==='gps' || v.source==='expense' ? v.source : 'photo',
      spends: (Array.isArray(v.spends) ? v.spends : []).filter(function(s){ return s && typeof s==='object' && num(s.amount)!==null; })
        .map(function(s){ return {key:str(s.key,300), title:str(s.title,100), cat:str(s.cat,20), amount:s.amount, cur:str(s.cur,5),
          krw: num(s.krw), memo:str(s.memo,200)}; }),
      photos: (Array.isArray(v.photos) ? v.photos : []).filter(function(p){ return p && typeof p.fileId==='string' && RE_ID.test(p.fileId); })
        .map(function(p){ return {fileId:p.fileId, key:str(p.key,200)}; }) };
  }).sort(function(a,b){ return a.ms-b.ms; });
}
function normalizeState(data){
  if(!data || typeof data!=='object' || !Array.isArray(data.trips) || !data.trips.length) return null;
  var trips = [];
  for(var i=0;i<data.trips.length;i++){
    var t = data.trips[i];
    if(!t || typeof t!=='object' || !RE_DAY.test(t.start) || !RE_DAY.test(t.end)) return null;
    var end = t.end < t.start ? t.start : t.end;
    trips.push({
      id: cleanId(t.id),
      title: str(t.title, 100) || '여행',
      start: t.start, end: end,
      note: str(t.note, 100),
      cities: Array.isArray(t.cities) ? t.cities.map(function(c){return str(c,50);}).filter(Boolean) : [],
      bgFile: (typeof t.bgFile==='string' && RE_ID.test(t.bgFile)) ? t.bgFile : undefined,
      routes: cleanRoutes(t.routes),
      visits: cleanVisits(t.visits),
      // 옛 형식 (absorbLegacyFiles가 파일로 옮김)
      bgImage: (!t.bgFile && typeof t.bgImage==='string' && /^data:image\//.test(t.bgImage)) ? t.bgImage : undefined,
      flights: (Array.isArray(t.flights) ? t.flights : []).filter(function(f){ return f && typeof f==='object'; }).map(function(f){
        return { id: cleanId(f.id), fromCode: str(f.fromCode,4), toCode: str(f.toCode,4),
          fromCity: str(f.fromCity,50), toCity: str(f.toCity,50),
          fromTime: RE_DT.test(f.fromTime) ? f.fromTime : '', toTime: RE_DT.test(f.toTime) ? f.toTime : '',
          meta: str(f.meta,100) };
      }),
      items: (Array.isArray(t.items) ? t.items : []).filter(function(it){ return it && typeof it==='object' && RE_DAY.test(it.day); }).map(function(it){
        return { id: cleanId(it.id), day: it.day,
          time: RE_TIME.test(it.time) ? it.time : '09:00',
          cat: CATS[it.cat] ? it.cat : '기타',
          name: str(it.name,100) || '일정', place: str(it.place,200), mapUrl: safeUrl(str(it.mapUrl,1000)),
          memo: str(it.memo,2000), move: MOVES[it.move] ? it.move : '',
          alarm: RE_TIME.test(it.alarm) ? it.alarm : '',
          alarmFired: typeof it.alarmFired==='string' ? it.alarmFired : '',
          lat: num(it.lat), lng: num(it.lng),
          placeId: str(it.placeId, 300), address: str(it.address, 300), geoMiss: it.geoMiss===true,
          userDocs: (Array.isArray(it.userDocs) ? it.userDocs : []).map(function(d){
            if(!d || typeof d.name!=='string') return null;
            if(typeof d.fileId==='string' && RE_ID.test(d.fileId)) return {name: str(d.name,100), fileId: d.fileId};
            // 옛 형식 (absorbLegacyFiles가 파일로 옮김)
            if(typeof d.data==='string' && RE_DOC_DATA.test(d.data)) return {name: str(d.name,100), data: d.data};
            return null;
          }).filter(Boolean) };
      })
    });
  }
  var activeId = trips.some(function(t){return t.id===data.activeId;}) ? data.activeId : trips[0].id;
  return { trips: trips, activeId: activeId };
}
// 화면은 메모리의 state를 바로 쓰고, 저장은 순서대로 뒤에서 IndexedDB에 기록
var saveChain = Promise.resolve();
function save(){
  var json = JSON.stringify(state);
  saveChain = saveChain.then(function(){ return dbSetMeta('state', json); }).catch(storageError);
  return saveChain;
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function seedData(){
  var today = new Date();
  var start = new Date(today.getFullYear(), today.getMonth(), today.getDate()+7);
  var d0 = fmtDate(start), d1 = fmtDate(addDays(start,1)), d2 = fmtDate(addDays(start,2));
  var tripId = uid();
  return {
    trips: [{
      id: tripId,
      title: '도쿄 여행',
      start: d0, end: d2,
      note: '2인',
      cities: ['도쿄'],
      flights: [
        {id:uid(), fromCode:'ICN', toCode:'NRT', fromCity:'서울', toCity:'도쿄',
         fromTime:d0+'T09:20', toTime:d0+'T11:45', meta:'OZ102'}
      ],
      items: [
        {id:uid(), day:d0, time:'13:00', cat:'숙소', name:'긴자 호텔 체크인', place:'東京都中央区銀座', mapUrl:'',
         memo:'프론트에서 여권 제시', move:'택시', alarm:'', lat:35.6717, lng:139.7650, userDocs:[]},
        {id:uid(), day:d0, time:'15:30', cat:'명소', name:'센소지', place:'東京都台東区浅草 浅草寺', mapUrl:'',
         memo:'나카미세 거리 간식 구경하기', move:'지하철', alarm:'', lat:35.7148, lng:139.7967, userDocs:[]},
        {id:uid(), day:d0, time:'19:00', cat:'식당', name:'라멘 이치란 신주쿠점', place:'東京都新宿区 一蘭 新宿', mapUrl:'',
         memo:'', move:'도보', alarm:'18:40', lat:35.6905, lng:139.7005, userDocs:[]},
        {id:uid(), day:d1, time:'10:00', cat:'명소', name:'팀랩 플래닛츠', place:'東京都江東区 teamLab Planets', mapUrl:'',
         memo:'양말 챙기기, 예약 필수', move:'지하철', alarm:'09:30', lat:35.6465, lng:139.7938, userDocs:[]},
        {id:uid(), day:d1, time:'13:00', cat:'카페', name:'블루보틀 시부야', place:'東京都渋谷区 Blue Bottle Coffee', mapUrl:'',
         memo:'', move:'도보', alarm:'', lat:35.6595, lng:139.7005, userDocs:[]},
        {id:uid(), day:d1, time:'15:00', cat:'쇼핑', name:'시부야 스크램블 스퀘어', place:'東京都渋谷区 渋谷スクランブルスクエア', mapUrl:'',
         memo:'전망대 스카이도 방문', move:'도보', alarm:'', lat:35.6580, lng:139.7016, userDocs:[]},
        {id:uid(), day:d2, time:'09:00', cat:'명소', name:'메이지 신궁', place:'東京都渋谷区 明治神宮', mapUrl:'',
         memo:'', move:'지하철', alarm:'', lat:35.6764, lng:139.6993, userDocs:[]},
        {id:uid(), day:d2, time:'11:30', cat:'이동', name:'나리타공항 이동', place:'成田国際空港', mapUrl:'',
         memo:'리무진버스 탑승', move:'버스', alarm:'11:00', lat:35.7647, lng:140.3864, userDocs:[]}
      ]
    }],
    activeId: tripId
  };
}
