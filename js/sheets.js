"use strict";

/* ---------- 일정 시트 ---------- */
function buildChips(container, obj, activeKey, onPick){
  container.innerHTML = '';
  Object.keys(obj).forEach(function(key){
    var b = document.createElement('button');
    b.type='button';
    b.className = 'chip' + (key===activeKey?' on':'');
    b.textContent = (typeof obj[key]==='object'? obj[key].emoji : obj[key]) + ' ' + key;
    b.addEventListener('click', function(){
      container.querySelectorAll('.chip').forEach(function(c){c.classList.remove('on');});
      b.classList.add('on');
      onPick(key);
    });
    container.appendChild(b);
  });
}

var curCat = '명소', curMove = '도보';

function openItemSheet(id){
  var trip = getTrip();
  editingItemId = id;
  var it = id ? findItem(trip,id) : null;
  document.getElementById('itemSheetTitle').textContent = it ? '일정 편집' : '일정 추가';
  curCat = it ? it.cat : '명소';
  curMove = it ? (it.move||'도보') : '도보';
  buildChips(document.getElementById('catChips'), CATS, curCat, function(k){curCat=k;});
  buildChips(document.getElementById('moveChips'), MOVES, curMove, function(k){curMove=k;});
  document.getElementById('itDay').value = it ? it.day : selectedDay;
  document.getElementById('itTime').value = it ? it.time : '09:00';
  document.getElementById('itName').value = it ? it.name : '';
  document.getElementById('itPlace').value = it ? it.place : '';
  initPlaceField(it);
  document.getElementById('itMapUrl').value = it ? (it.mapUrl||'') : '';
  document.getElementById('itAlarm').value = it ? (it.alarm||'') : '';
  document.getElementById('itMemo').value = it ? (it.memo||'') : '';
  pendingAttachments = it ? (it.userDocs||[]).slice() : [];
  renderAttachList();
  document.getElementById('itDelete').classList.toggle('hide', !it);
  openSheet('sheetItem');
}
function renderAttachList(){
  var wrap = document.getElementById('attachList');
  wrap.innerHTML = '';
  pendingAttachments.forEach(function(doc, idx){
    var row = document.createElement('div');
    row.className='a';
    row.innerHTML = '<span>'+(isPdfFile(doc.fileId)?'📄':'🖼️')+'</span><span>'+escapeHtml(doc.name)+'</span><span class="x" data-idx="'+idx+'">✕</span>';
    row.querySelector('.x').addEventListener('click', function(){ pendingAttachments.splice(idx,1); renderAttachList(); });
    wrap.appendChild(row);
  });
}
// 사진은 가로 maxW(기본 1000px) JPEG로 줄인 Blob, PDF는 그대로 돌려준다.
// failNull이면 사진을 못 읽었을 때 원본 대신 null을 준다 (방문 썸네일용)
function resizeImage(file, cb, maxW, failNull){
  if(file.type==='application/pdf'){ cb(file); return; }
  var src = URL.createObjectURL(file);
  var img = new Image();
  img.onerror = function(){ URL.revokeObjectURL(src); cb(failNull ? null : file); };
  img.onload = function(){
    maxW = maxW || 1000; var scale = Math.min(1, maxW/img.width);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width*scale); canvas.height = Math.round(img.height*scale);
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    URL.revokeObjectURL(src);
    canvas.toBlob(function(blob){ cb(blob || (failNull ? null : file)); }, 'image/jpeg', 0.82);
  };
  img.src = src;
}

async function saveItem(){
  var trip = getTrip();
  var name = document.getElementById('itName').value.trim();
  if(!name){ toast('일정 이름을 입력해주세요'); return; }
  var day = document.getElementById('itDay').value || selectedDay;
  var time = document.getElementById('itTime').value || '09:00';
  var place = document.getElementById('itPlace').value.trim();
  var mapUrl = safeUrl(document.getElementById('itMapUrl').value.trim());
  var alarm = document.getElementById('itAlarm').value;
  var memo = document.getElementById('itMemo').value.trim();

  var it = editingItemId ? findItem(trip, editingItemId) : null;
  var isNew = !it;
  if(isNew){
    it = {id:uid(), lat:null, lng:null};
    trip.items.push(it);
  }
  var placeChanged = it.place !== place;
  it.day=day; it.time=time; it.cat=curCat; it.name=name; it.place=place; it.mapUrl=mapUrl;
  it.move=curMove; it.alarm=alarm; it.memo=memo; it.userDocs=pendingAttachments.slice();
  // alarmFired는 '울린 날짜 시각' 문자열이라 날짜·알람 시간을 바꾸면 저절로 다시 울린다
  if(typeof it.alarmFired!=='string') it.alarmFired = '';
  var needGeocode = false;
  if(pickedPlace && pickedPlace.text===place){
    // 목록에서 고른 장소 → 좌표 바로 저장
    it.placeId = pickedPlace.placeId; it.address = pickedPlace.address;
    it.lat = pickedPlace.lat; it.lng = pickedPlace.lng; it.geoMiss = false;
  } else if(!place){
    it.placeId=''; it.address=''; it.lat=null; it.lng=null; it.geoMiss=false;
  } else if(placeChanged || it.lat==null){
    // 직접 친 글자 → 저장 후 텍스트 검색으로 좌표 찾기
    it.placeId=''; it.address=''; it.lat=null; it.lng=null; it.geoMiss=false;
    needGeocode = true;
  }

  save(); render(); closeSheet('sheetItem'); toast(isNew?'일정을 추가했어요':'일정을 저장했어요');

  if(needGeocode && hasMapsKey()){
    var pos = await geocodeText(place);
    if(it.place!==place) return; // 그 사이 다시 수정됨
    if(pos){ it.lat=pos.lat; it.lng=pos.lng; }
    else { it.geoMiss = true; toast('장소 위치를 찾지 못했어요. 목록에서 골라주세요'); }
    save();
    // 좌표가 생겼으니 오버뷰를 보고 있으면 다시 그린다
    if(pos && getTrip()===trip && !document.getElementById('pageOverview').classList.contains('hide')) renderOverview(trip);
  }
}

document.getElementById('btnAttach').addEventListener('click', function(){ document.getElementById('fileAttachInput').click(); });
document.getElementById('fileAttachInput').addEventListener('change', function(e){
  var files = Array.from(e.target.files||[]);
  var remaining = files.length;
  if(!remaining) return;
  files.forEach(function(f){
    resizeImage(f, function(blob){
      pendingAttachments.push({name:f.name, fileId:addFile(blob)});
      remaining--;
      if(remaining===0) renderAttachList();
    });
  });
  e.target.value='';
});
document.getElementById('itSave').addEventListener('click', saveItem);
document.getElementById('itCancel').addEventListener('click', function(){ closeSheet('sheetItem'); });
document.getElementById('itDelete').addEventListener('click', function(){
  if(!editingItemId) return;
  var trip=getTrip(); deleteItem(trip, editingItemId); closeSheet('sheetItem');
});
document.getElementById('btnAddItem').addEventListener('click', function(){ openItemSheet(null); });

/* ---------- 항공편 시트 ---------- */
function openFlightSheet(id){
  var trip = getTrip();
  editingFlightId = id;
  var f = id ? trip.flights.find(function(x){return x.id===id;}) : null;
  document.getElementById('flightSheetTitle').textContent = f ? '항공편 편집' : '항공편 추가';
  document.getElementById('flFromCode').value = f ? f.fromCode : '';
  document.getElementById('flToCode').value = f ? f.toCode : '';
  document.getElementById('flFromCity').value = f ? f.fromCity : '';
  document.getElementById('flToCity').value = f ? f.toCity : '';
  document.getElementById('flFromTime').value = f ? f.fromTime : selectedDay+'T09:00';
  document.getElementById('flToTime').value = f ? f.toTime : selectedDay+'T11:00';
  document.getElementById('flMeta').value = f ? (f.meta||'') : '';
  document.getElementById('flDelete').classList.toggle('hide', !f);
  openSheet('sheetFlight');
}
document.getElementById('flSave').addEventListener('click', function(){
  var trip = getTrip();
  var f = editingFlightId ? trip.flights.find(function(x){return x.id===editingFlightId;}) : null;
  if(!f){ f={id:uid()}; trip.flights.push(f); }
  f.fromCode=document.getElementById('flFromCode').value.trim().toUpperCase();
  f.toCode=document.getElementById('flToCode').value.trim().toUpperCase();
  f.fromCity=document.getElementById('flFromCity').value.trim();
  f.toCity=document.getElementById('flToCity').value.trim();
  f.fromTime=document.getElementById('flFromTime').value;
  f.toTime=document.getElementById('flToTime').value;
  f.meta=document.getElementById('flMeta').value.trim();
  save(); render(); closeSheet('sheetFlight'); toast('항공편을 저장했어요');
});
document.getElementById('flCancel').addEventListener('click', function(){ closeSheet('sheetFlight'); });
document.getElementById('flDelete').addEventListener('click', function(){
  var trip = getTrip();
  trip.flights = trip.flights.filter(function(x){return x.id!==editingFlightId;});
  save(); render(); closeSheet('sheetFlight'); toast('항공편을 삭제했어요');
});

/* ---------- 여행 추가/편집 시트 ---------- */
function openTripSheet(id){
  editingTripId = id;
  var t = id ? getTripById(id) : null;
  document.getElementById('tripSheetTitle').textContent = t ? '여행 편집' : '새 여행 만들기';
  document.getElementById('trTitle').value = t ? t.title : '';
  document.getElementById('trStart').value = t ? t.start : todayStr();
  document.getElementById('trEnd').value = t ? t.end : todayStr();
  document.getElementById('trNote').value = t ? (t.note||'') : '';
  document.getElementById('trCities').value = t ? (t.cities||[]).join(', ') : '';
  document.getElementById('trDelete').classList.toggle('hide', !t || state.trips.length<=1);
  openSheet('sheetTrip');
}
document.getElementById('trSave').addEventListener('click', function(){
  var title = document.getElementById('trTitle').value.trim();
  if(!title){ toast('여행 제목을 입력해주세요'); return; }
  var start = document.getElementById('trStart').value;
  if(!start){ toast('시작일을 입력해주세요'); return; }
  var end = document.getElementById('trEnd').value || start;
  if(end<start) end=start;
  var note = document.getElementById('trNote').value.trim();
  var cities = document.getElementById('trCities').value.split(',').map(function(s){return s.trim();}).filter(Boolean);
  var t = editingTripId ? getTripById(editingTripId) : null;
  var isNew = !t;
  if(isNew){ t={id:uid(), flights:[], items:[]}; state.trips.push(t); state.activeId=t.id; }
  t.title=title; t.start=start; t.end=end; t.note=note; t.cities=cities;
  save(); selectedDay=null; render(); closeSheet('sheetTrip'); toast(isNew?'여행을 만들었어요':'여행을 저장했어요');
});
document.getElementById('trCancel').addEventListener('click', function(){ closeSheet('sheetTrip'); });
document.getElementById('trDelete').addEventListener('click', function(){
  if(state.trips.length<=1) return;
  state.trips = state.trips.filter(function(t){return t.id!==editingTripId;});
  if(state.activeId===editingTripId) state.activeId = state.trips[0].id;
  save(); selectedDay=null; render(); closeSheet('sheetTrip'); toast('여행을 삭제했어요');
});

/* ---------- 내 여행 목록 시트 ---------- */
var pendingDeleteTripId = null;
function renderTripList(){
  var wrap = document.getElementById('tripListWrap');
  wrap.innerHTML='';
  state.trips.forEach(function(t){
    var row = document.createElement('div');
    row.className='triprow'+(t.id===state.activeId?' active':'');
    row.innerHTML = '<div class="ck"></div><div class="info"><div class="t">'+escapeHtml(t.title)+'</div>'+
      '<div class="d">'+niceDate(t.start)+' ~ '+niceDate(t.end)+' · 일정 '+t.items.length+'개</div></div>'+
      '<button class="tbtn" data-act="edit">편집</button><button class="tbtn" data-act="del">삭제</button>';
    row.querySelector('.info').addEventListener('click', function(){
      state.activeId=t.id; save(); selectedDay=null; render(); closeSheet('sheetTripList'); toast(t.title+'(으)로 전환했어요');
    });
    row.querySelector('[data-act="edit"]').addEventListener('click', function(e){ e.stopPropagation(); openTripSheet(t.id); });
    var delBtn = row.querySelector('[data-act="del"]');
    if(state.trips.length<=1){ delBtn.style.display='none'; }
    delBtn.addEventListener('click', function(e){
      e.stopPropagation();
      if(pendingDeleteTripId===t.id){
        state.trips = state.trips.filter(function(x){return x.id!==t.id;});
        if(state.activeId===t.id) state.activeId=state.trips[0].id;
        save(); selectedDay=null; render(); renderTripList(); toast('여행을 삭제했어요');
        pendingDeleteTripId=null;
      } else {
        pendingDeleteTripId=t.id;
        delBtn.textContent='한 번 더 눌러 삭제';
        toast('한 번 더 누르면 삭제돼요');
        setTimeout(function(){ if(pendingDeleteTripId===t.id){pendingDeleteTripId=null; delBtn.textContent='삭제';} }, 3000);
      }
    });
    wrap.appendChild(row);
  });
}
document.getElementById('btnTripName').addEventListener('click', function(){ renderTripList(); openSheet('sheetTripList'); });
document.getElementById('btnNewTrip').addEventListener('click', function(){ openTripSheet(null); });
document.getElementById('btnGoNewTrip').addEventListener('click', function(){ closeSheet('sheetTripList'); openTripSheet(null); });

/* ---------- 배경사진 ---------- */
document.getElementById('btnCamera').addEventListener('click', function(){ document.getElementById('fileCameraInput').click(); });
document.getElementById('fileCameraInput').addEventListener('change', function(e){
  var f = e.target.files[0]; if(!f) return;
  resizeImage(f, function(blob){
    var trip=getTrip(); trip.bgFile=addFile(blob); save(); render(); toast('배경 사진을 변경했어요');
  });
  e.target.value='';
});

/* ---------- 페이지 탭 ---------- */
/* 맨 위 탭: 계획 / 실제 / 비교. 계획 안에서 일정 / 지도 전환 */
var curPage = 'plan', planView = 'list';
document.getElementById('tabPlan').addEventListener('click', function(){ switchPage('plan'); });
document.getElementById('tabActual').addEventListener('click', function(){ switchPage('actual'); });
document.getElementById('tabCompare').addEventListener('click', function(){ switchPage('compare'); });
document.getElementById('tabSchedule').addEventListener('click', function(){ switchPage('schedule'); });
document.getElementById('tabOverview').addEventListener('click', function(){ switchPage('overview'); });
function isVisible(id){ return !document.getElementById(id).classList.contains('hide'); }
// p: 'plan' | 'actual' | 'compare', 또는 계획 안의 'schedule'(일정) | 'overview'(지도)
function switchPage(p){
  if(p==='schedule'){ planView='list'; p='plan'; }
  if(p==='overview'){ planView='map'; p='plan'; }
  curPage = p;
  var plan = p==='plan';
  document.getElementById('tabPlan').classList.toggle('active', plan);
  document.getElementById('tabActual').classList.toggle('active', p==='actual');
  document.getElementById('tabCompare').classList.toggle('active', p==='compare');
  document.getElementById('planSubtabs').classList.toggle('hide', !plan);
  document.getElementById('tabSchedule').classList.toggle('on', planView==='list');
  document.getElementById('tabOverview').classList.toggle('on', planView==='map');
  document.getElementById('pageSchedule').classList.toggle('hide', !(plan && planView==='list'));
  document.getElementById('pageOverview').classList.toggle('hide', !(plan && planView==='map'));
  document.getElementById('pageActual').classList.toggle('hide', p!=='actual');
  document.getElementById('pageCompare').classList.toggle('hide', p!=='compare');
  // 하단 버튼: 계획 → 일정 추가, 실제 → 위치 등록·사진 넣기
  document.getElementById('btnAddItem').classList.toggle('hide', !plan);
  document.getElementById('btnLocate').classList.toggle('hide', p!=='actual');
  document.getElementById('btnPhotos').classList.toggle('hide', p!=='actual');
  if(plan && planView==='map'){ setTimeout(function(){ renderOverview(getTrip()); }, 30); }
  if(p==='actual'){ setTimeout(function(){ renderActual(getTrip()); }, 30); }
}

/* ---------- 설정 시트 ---------- */
document.getElementById('btnSettings').addEventListener('click', function(){ openSheet('sheetSettings'); });
document.getElementById('setTitle').addEventListener('click', function(){ closeSheet('sheetSettings'); openTripSheet(getTrip().id); });
document.getElementById('setBg').addEventListener('click', function(){ closeSheet('sheetSettings'); document.getElementById('fileCameraInput').click(); });
document.getElementById('setNoti').addEventListener('click', function(){
  if(!('Notification' in window)){ toast('이 브라우저는 알림을 지원하지 않아요'); return; }
  Notification.requestPermission().then(function(p){ toast(p==='granted' ? '알림이 허용됐어요' : '알림이 거부됐어요'); });
});
// 백업 내보내기/가져오기 버튼은 backup.js
document.getElementById('setIcs').addEventListener('click', function(){
  var trip = getTrip();
  downloadIcsForItems(trip.items, trip.title);
});
document.getElementById('setReset').addEventListener('click', function(){
  if(pendingResetConfirm){
    state = seedData(); save(); pruneFiles(); selectedDay=null; render(); closeSheet('sheetSettings'); toast('초기화했어요'); pendingResetConfirm=false;
    document.getElementById('setReset').textContent='초기화';
  } else {
    pendingResetConfirm=true; document.getElementById('setReset').textContent='한 번 더 눌러 초기화';
    setTimeout(function(){ pendingResetConfirm=false; document.getElementById('setReset').textContent='초기화'; }, 3000);
  }
});
var pendingResetConfirm=false;

/* ---------- 도움말 ---------- */
document.getElementById('btnHelp').addEventListener('click', function(){ openSheet('sheetHelp'); });
document.getElementById('helpClose').addEventListener('click', function(){ closeSheet('sheetHelp'); });

/* ---------- 시트 공통 ---------- */
function openSheet(id){
  document.getElementById('overlayBg').classList.add('show');
  document.getElementById(id).classList.add('show');
}
function closeSheet(id){
  document.getElementById(id).classList.remove('show');
  var anyOpen = document.querySelectorAll('.sheet.show').length>0;
  if(!anyOpen) document.getElementById('overlayBg').classList.remove('show');
}
document.getElementById('overlayBg').addEventListener('click', function(){
  document.querySelectorAll('.sheet.show').forEach(function(s){ s.classList.remove('show'); });
  this.classList.remove('show');
});
