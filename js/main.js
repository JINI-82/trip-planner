"use strict";

/* ---------- 토스트 ---------- */
function toast(msg){
  var wrap = document.getElementById('toastwrap');
  var t = document.createElement('div'); t.className='toast'; t.textContent=msg;
  wrap.appendChild(t);
  setTimeout(function(){ t.remove(); }, 2400);
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
  render();
  checkAlarms();
}
init();
