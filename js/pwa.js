"use strict";

/* ---------- PWA: 서비스 워커 등록 ----------
 * HTTPS(깃허브 페이지)나 localhost에서만 동작한다. */
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(e){ console.warn('서비스 워커 등록 실패', e); });
  });
}

// 지도 불러오기 실패 문구 (오프라인이면 따로 안내)
function mapFailMsg(){
  return navigator.onLine === false
    ? '오프라인이라 지도를 불러오지 못했어요. 일정과 기록은 그대로 볼 수 있어요.'
    : '지도를 불러오지 못했어요. 인터넷 연결이나 API 키 설정을 확인해주세요.';
}
// 다시 온라인이 되면 보고 있던 지도를 다시 그린다
window.addEventListener('online', function(){ if(state) render(); });
