"use strict";

/* ---------- 여행 공유 파일 (카톡 등으로 주고받기) ----------
 * 형식: { app:'jplanner-trip', version:1, exportedAt, trip, files:{id:{type,data}} }
 * - 일정 첨부(예약 서류)는 개인 정보라 공유 파일에 넣지 않는다.
 * - '사진 포함'이면 방문 사진 썸네일과 헤더 배경을 넣는다.
 * - 받으면 새 여행으로 추가하고 id는 모두 새로 만든다 (내 데이터와 겹치지 않게). */
var SHARE_APP = 'jplanner-trip';
var SHARE_VERSION = 1;
var sharingTripId = null;

function tripPhotoIds(trip){
  var ids = [];
  if(trip.bgFile && FILES[trip.bgFile]) ids.push(trip.bgFile);
  (trip.visits||[]).forEach(function(v){ v.photos.forEach(function(p){ if(FILES[p.fileId]) ids.push(p.fileId); }); });
  return ids;
}
function fmtSize(bytes){
  return bytes < 1024*1024 ? Math.max(1, Math.round(bytes/1024))+'KB' : (bytes/1024/1024).toFixed(1)+'MB';
}

function openShareSheet(tripId){
  var trip = getTripById(tripId); if(!trip) return;
  sharingTripId = tripId;
  var ids = tripPhotoIds(trip);
  var bytes = ids.reduce(function(n, id){ return n + FILES[id].blob.size; }, 0);
  document.getElementById('shareSub').textContent = trip.title+' · 일정 '+trip.items.length+'개 · 방문 '+(trip.visits||[]).length+'곳 (예약 서류 첨부는 빠져요)';
  document.getElementById('shareSizeP').textContent = ids.length ? '사진 '+ids.length+'장 · 약 '+fmtSize(bytes*1.37) : '보낼 사진이 없어요';
  document.getElementById('shareWithPhotos').disabled = !ids.length;
  closeSheet('sheetTripList');
  openSheet('sheetShare');
}

async function buildTripShare(trip, withPhotos){
  var copy = JSON.parse(JSON.stringify(trip));
  copy.items.forEach(function(it){ it.userDocs = []; it.alarmFired = ''; });
  var files = {};
  if(withPhotos){
    var ids = tripPhotoIds(trip);
    for(var i=0;i<ids.length;i++){
      var f = FILES[ids[i]];
      files[ids[i]] = {type:f.type, data: await blobToDataUrl(f.blob)};
    }
  } else {
    delete copy.bgFile;
    (copy.visits||[]).forEach(function(v){ v.photos = []; });
  }
  var json = JSON.stringify({app:SHARE_APP, version:SHARE_VERSION, exportedAt:new Date().toISOString(), trip:copy, files:files});
  var name = (trip.title || '여행').replace(/[\\\/:*?"<>|]/g, '').trim().slice(0, 40) || '여행';
  return new File([json], name+'.jplanner.json', {type:'application/json'});
}

async function shareTrip(withPhotos){
  var trip = getTripById(sharingTripId); if(!trip) return;
  try{
    var file = await buildTripShare(trip, withPhotos);
    var r = await saveBackupFile(file); // 아이폰: 공유 시트(카톡 등) / PC: 다운로드
    if(r==='cancelled') return;
    closeSheet('sheetShare');
    toast(r==='shared' ? '여행을 공유했어요' : '공유 파일을 내려받았어요');
  }catch(e){ console.warn('공유 실패', e); toast('공유 파일을 만들지 못했어요'); }
}

// 공유 파일 → 새 여행으로 추가. 성공하면 새 여행, 형식이 아니면 null
function importTripShare(text){
  var data = JSON.parse(text);
  if(data && data.app===BACKUP_APP) throw new Error('FULL_BACKUP');
  if(!data || data.app!==SHARE_APP || typeof data.version!=='number') return null;
  if(data.version > SHARE_VERSION) throw new Error('NEWER');
  var st = normalizeState({trips:[data.trip], activeId:''});
  if(!st) return null;
  var trip = st.trips[0];
  // 파일: 새 id로 저장하고 참조를 바꾼다
  var idMap = {};
  var src = (data.files && typeof data.files==='object') ? data.files : {};
  Object.keys(src).forEach(function(id){
    var f = src[id];
    if(!RE_ID.test(id) || !f || typeof f.data!=='string' || !/^data:image\//i.test(f.data)) return;
    var blob = dataUrlToBlob(f.data);
    if(blob) idMap[id] = addFile(blob);
  });
  trip.bgFile = trip.bgFile && idMap[trip.bgFile] ? idMap[trip.bgFile] : undefined;
  delete trip.bgImage;
  trip.items.forEach(function(it){ it.id = uid(); it.userDocs = []; it.alarmFired = ''; });
  trip.flights.forEach(function(f){ f.id = uid(); });
  trip.visits.forEach(function(v){
    v.id = uid();
    v.photos = v.photos.filter(function(p){ return idMap[p.fileId]; }).map(function(p){ return {fileId:idMap[p.fileId], key:p.key}; });
  });
  trip.id = uid();
  if(state.trips.some(function(t){ return t.title===trip.title; })) trip.title += ' (공유)';
  state.trips.push(trip);
  state.activeId = trip.id;
  return trip;
}

document.getElementById('shareWithPhotos').addEventListener('click', function(){ shareTrip(true); });
document.getElementById('shareNoPhotos').addEventListener('click', function(){ shareTrip(false); });
document.getElementById('shareClose').addEventListener('click', function(){ closeSheet('sheetShare'); });
document.getElementById('btnImportTrip').addEventListener('click', function(){ document.getElementById('tripImportInput').click(); });
document.getElementById('tripImportInput').addEventListener('change', function(e){
  var f = e.target.files[0]; if(!f) return;
  e.target.value = '';
  f.text().then(function(text){
    var trip = importTripShare(text);
    if(!trip){ toast('여행 공유 파일이 아니에요'); return; }
    save(); selectedDay = null; render(); closeSheet('sheetTripList');
    toast('"'+trip.title+'" 여행을 추가했어요');
  }).catch(function(err){
    console.warn('여행 가져오기 실패', err);
    if(err && err.message==='FULL_BACKUP') toast('전체 백업 파일이에요. 설정 → 백업 가져오기로 열어주세요');
    else if(err && err.message==='NEWER') toast('더 새 버전 앱에서 만든 파일이에요');
    else toast('파일을 읽을 수 없어요');
  });
});
