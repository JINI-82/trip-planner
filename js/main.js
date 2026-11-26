"use strict";

/* ---------- 토스트 ---------- */
function toast(msg){
  var wrap = document.getElementById('toastwrap');
  var t = document.createElement('div'); t.className='toast'; t.textContent=msg;
  wrap.appendChild(t);
  setTimeout(function(){ t.remove(); }, 2400);
}

/* ---------- PWA manifest (inline data URI) ---------- */
function setupManifest(){
  var manifest = {
    name:'J플래너', short_name:'J플래너', start_url:'.', display:'standalone',
    background_color:'#f6f8fa', theme_color:'#1b4b7a',
    icons:[
      {src:'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'192\' height=\'192\'%3E%3Crect width=\'192\' height=\'192\' rx=\'40\' fill=\'%231b4b7a\'/%3E%3Ctext x=\'96\' y=\'128\' font-size=\'100\' text-anchor=\'middle\' fill=\'%23e0a94e\' font-family=\'sans-serif\'%3EJ%3C/text%3E%3C/svg%3E', sizes:'192x192', type:'image/svg+xml'},
      {src:'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'512\' height=\'512\'%3E%3Crect width=\'512\' height=\'512\' rx=\'100\' fill=\'%231b4b7a\'/%3E%3Ctext x=\'256\' y=\'340\' font-size=\'260\' text-anchor=\'middle\' fill=\'%23e0a94e\' font-family=\'sans-serif\'%3EJ%3C/text%3E%3C/svg%3E', sizes:'512x512', type:'image/svg+xml'}
    ]
  };
  var blob = new Blob([JSON.stringify(manifest)], {type:'application/json'});
  document.getElementById('manifestLink').href = URL.createObjectURL(blob);
}

/* ---------- 초기화 ---------- */
async function init(){
  try{ await loadAllFiles(); }
  catch(e){ console.warn('저장소를 열 수 없어요', e); toast('저장소를 열 수 없어 이번에는 저장되지 않아요'); }
  state = await loadState();
  dropMissingFiles(state);
  if(!state.activeId || !getTripById(state.activeId)) state.activeId = state.trips[0].id;
  save();        // 옛 데이터 이전·정리 결과 저장
  pruneFiles();  // 안 쓰는 파일 정리
  state.trips.forEach(pruneRouteCache); // 안 쓰는 저장 경로 정리
  requestPersist();
  selectedDay = null;
  setupManifest();
  render();
  checkAlarms();
}
init();
