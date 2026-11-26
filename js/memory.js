"use strict";

/* ---------- 추억 탭: 끝난 여행 모아보기 ----------
 * 종료일이 오늘보다 앞인 여행을 최근 것부터 카드로 보여준다.
 * 카드를 누르면 그 여행으로 바꾸고 실제 탭을 연다. */
function tripCover(trip){
  if(trip.bgFile && FILES[trip.bgFile]) return fileUrl(trip.bgFile);
  var v = (trip.visits||[]).find(function(x){ return x.photos && x.photos.length && FILES[x.photos[0].fileId]; });
  return v ? fileUrl(v.photos[0].fileId) : '';
}

function renderMemory(){
  var today = todayStr();
  var past = state.trips.filter(function(t){ return t.end < today; })
    .sort(function(a,b){ return b.start.localeCompare(a.start); });
  var wrap = document.getElementById('memoryList');
  if(!past.length){
    wrap.innerHTML = '<div class="emptyday">아직 끝난 여행이 없어요<br>여행이 끝나면 여기에 모여요</div>';
    return;
  }
  wrap.innerHTML = past.map(function(t){
    var visits = t.visits||[];
    var photos = visits.reduce(function(n, v){ return n + v.photos.length; }, 0);
    var stat = matchTrip(t);
    var cover = tripCover(t);
    var style = visits.length ? '계획파 '+Math.round(stat.matched/stat.visitCount*100)+'%' : '방문 기록 없음';
    return '<button class="memcard" data-id="'+escapeAttr(t.id)+'">'+
      '<div class="cover"'+(cover ? ' style="background-image:url(&quot;'+escapeAttr(cover)+'&quot;)"' : '')+'>'+(cover?'':'🧭')+'</div>'+
      '<div class="info"><div class="t">'+escapeHtml(t.title)+'</div>'+
        '<div class="d">'+niceDate(t.start)+' – '+niceDate(t.end)+' · '+parseDate(t.start).getFullYear()+'</div>'+
        '<div class="s">👣 방문 '+visits.length+'곳 · 🖼 사진 '+photos+'장 · '+style+'</div></div>'+
    '</button>';
  }).join('');
  wrap.querySelectorAll('.memcard').forEach(function(b){
    b.addEventListener('click', function(){
      state.activeId = b.getAttribute('data-id'); save();
      selectedDay = null; render(); switchPage('actual');
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
}
