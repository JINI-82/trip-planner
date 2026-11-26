"use strict";

/* ---------- 렌더링 ---------- */
function render(){
  var trip = getTrip();
  if(!trip){ return; }
  if(!selectedDay || dateRange(trip.start,trip.end).indexOf(selectedDay)===-1){
    var range = dateRange(trip.start,trip.end);
    selectedDay = range.indexOf(todayStr())!==-1 ? todayStr() : range[0];
  }
  document.getElementById('tripNameLabel').textContent = trip.title;
  document.getElementById('headerTitle').textContent = trip.title;
  document.getElementById('headerSub').textContent = calcSub(trip);
  document.getElementById('headerLabel').textContent = headerLabelText(trip);
  document.getElementById('ddayBadge').textContent = calcDday(trip);
  var bg = document.getElementById('headerBg');
  var bgUrl = trip.bgFile ? fileUrl(trip.bgFile) : '';
  bg.style.backgroundImage = bgUrl ? 'url("'+bgUrl+'")' : '';

  renderDayTabs(trip);
  renderSchedulePage(trip);
  if(!document.getElementById('pageOverview').classList.contains('hide')){
    renderOverview(trip);
  }
}

function renderDayTabs(trip){
  var wrap = document.getElementById('dayTabs');
  var days = dateRange(trip.start, trip.end);
  var citiesArr = trip.cities || [];
  wrap.innerHTML = '';
  days.forEach(function(d, idx){
    var dt = parseDate(d);
    var city = citiesArr.length ? citiesArr[Math.min(idx, citiesArr.length-1)] : '';
    var chip = document.createElement('button');
    chip.className = 'daychip' + (d===selectedDay ? ' active':'');
    chip.innerHTML = '<div class="dow">'+DOW[dt.getDay()]+'</div><div class="md">'+(dt.getMonth()+1)+'/'+dt.getDate()+'</div>'+(city?'<div class="city">'+escapeHtml(city)+'</div>':'');
    chip.addEventListener('click', function(){
      selectedDay = d;
      renderDayTabs(trip);
      renderSchedulePage(trip);
      var firstCard = document.querySelector('.itemcard[data-day="'+d+'"]');
      if(firstCard) firstCard.scrollIntoView({behavior:'smooth', block:'center'});
      if(!document.getElementById('pageOverview').classList.contains('hide')) renderOverview(trip);
    });
    wrap.appendChild(chip);
  });
}

function sortedItems(trip, day){
  return trip.items.filter(function(i){return i.day===day;}).sort(function(a,b){ return a.time.localeCompare(b.time); });
}

function renderSchedulePage(trip){
  var page = document.getElementById('pageSchedule');
  var html = '';

  // 항공편
  html += '<div class="sectiontitle">✈️ 항공편</div>';
  (trip.flights||[]).forEach(function(f){
    html += flightCardHtml(f);
  });
  html += '<button class="addflightbtn" data-act="addflight">＋ 항공편 추가</button>';

  // 서류함
  var docs = [];
  trip.items.forEach(function(it){ (it.userDocs||[]).forEach(function(doc){ docs.push({doc:doc, item:it}); }); });
  if(docs.length){
    html += '<div class="sectiontitle">📎 예약 서류함</div><div class="doclist">';
    docs.forEach(function(d){
      var isPdf = isPdfFile(d.doc.fileId);
      html += '<div class="docitem" data-act="opendoc" data-file="'+escapeAttr(d.doc.fileId)+'">'+
        '<div class="ico">'+(isPdf?'📄':'🖼️')+'</div>'+
        '<div class="t"><div class="n">'+escapeHtml(d.doc.name)+'</div><div class="m">'+niceDate(d.item.day)+' · '+escapeHtml(d.item.name)+'</div></div>'+
      '</div>';
    });
    html += '</div>';
  }

  // 일정
  html += '<div class="sectiontitle">🗓 '+niceDate(selectedDay)+' 일정</div>';
  var items = sortedItems(trip, selectedDay);
  if(items.length===0){
    html += '<div class="emptyday">아직 일정이 없어요<br>＋ 일정 추가로 채워보세요</div>';
  } else {
    items.forEach(function(it){ html += itemCardHtml(it); });
  }

  page.innerHTML = html;
  bindSchedulePageEvents(trip);
}

function flightCardHtml(f){
  var ft = f.fromTime ? f.fromTime.split('T')[1] : '--:--';
  var tt = f.toTime ? f.toTime.split('T')[1] : '--:--';
  return '<div class="flightcard flight-item" data-act="editflight" data-id="'+f.id+'">'+
    '<button class="editx" data-act="editflight" data-id="'+f.id+'">편집</button>'+
    '<div class="row">'+
      '<div class="side"><div class="code">'+escapeHtml(f.fromCode||'')+'</div><div class="city">'+escapeHtml(f.fromCity||'')+'</div><div class="time">'+ft+'</div></div>'+
      '<div class="mid">✈️</div>'+
      '<div class="side"><div class="code">'+escapeHtml(f.toCode||'')+'</div><div class="city">'+escapeHtml(f.toCity||'')+'</div><div class="time">'+tt+'</div></div>'+
    '</div>'+
    (f.meta ? '<div class="meta">'+escapeHtml(f.meta)+'</div>' : '') +
  '</div>';
}

function itemCardHtml(it){
  var cat = CATS[it.cat] || CATS['기타'];
  var moveTag = it.move ? '<span class="tag">'+(MOVES[it.move]||'')+' '+it.move+'</span>' : '';
  return '<div class="itemcard" data-day="'+it.day+'" data-id="'+it.id+'">'+
    '<div class="cico" style="background:'+cat.color+'22;color:'+cat.color+';">'+cat.emoji+'</div>'+
    '<div class="body">'+
      '<div class="top"><span class="time">'+it.time+'</span><span class="name">'+escapeHtml(it.name)+'</span>'+
        (it.alarm ? '<span class="alarm">⏰ '+it.alarm+'</span>' : '')+
      '</div>'+
      '<div class="tags"><span class="tag">'+cat.emoji+' '+it.cat+'</span>'+moveTag+'</div>'+
      (it.memo ? '<div class="memo">'+escapeHtml(it.memo)+'</div>' : '')+
      '<div class="btns">'+
        '<button data-act="go" data-id="'+it.id+'">🧭 길찾기</button>'+
        '<button data-act="map" data-id="'+it.id+'">🗺 지도보기</button>'+
        '<button data-act="ics" data-id="'+it.id+'">📅 캘린더</button>'+
        (it.userDocs && it.userDocs.length ? '<button data-act="attachview" data-id="'+it.id+'">📎 첨부('+it.userDocs.length+')</button>' : '')+
        '<button data-act="edit" data-id="'+it.id+'">✏️ 편집</button>'+
        '<button data-act="del" data-id="'+it.id+'" class="danger">🗑 삭제</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

function mapUrlFor(it, mode){
  if(it.mapUrl && it.mapUrl.trim()) return it.mapUrl.trim();
  var q = encodeURIComponent(it.place || it.name);
  if(mode==='dir') return 'https://www.google.com/maps/dir/?api=1&destination='+q;
  return 'https://www.google.com/maps/search/?api=1&query='+q;
}

function bindSchedulePageEvents(trip){
  var page = document.getElementById('pageSchedule');
  page.querySelectorAll('[data-act="addflight"]').forEach(function(b){ b.addEventListener('click', function(){ openFlightSheet(null); }); });
  page.querySelectorAll('[data-act="editflight"]').forEach(function(b){ b.addEventListener('click', function(e){ e.stopPropagation(); openFlightSheet(b.getAttribute('data-id')); }); });
  page.querySelectorAll('[data-act="opendoc"]').forEach(function(b){
    b.addEventListener('click', function(){
      openFile(b.getAttribute('data-file'));
    });
  });
  page.querySelectorAll('[data-act="go"]').forEach(function(b){ b.addEventListener('click', function(){ var it=findItem(trip,b.getAttribute('data-id')); window.open(mapUrlFor(it,'dir'), '_blank'); }); });
  page.querySelectorAll('[data-act="map"]').forEach(function(b){ b.addEventListener('click', function(){ var it=findItem(trip,b.getAttribute('data-id')); window.open(mapUrlFor(it,'search'), '_blank'); }); });
  page.querySelectorAll('[data-act="ics"]').forEach(function(b){ b.addEventListener('click', function(){ var it=findItem(trip,b.getAttribute('data-id')); downloadIcsForItems([it], it.name); }); });
  page.querySelectorAll('[data-act="attachview"]').forEach(function(b){ b.addEventListener('click', function(){ var it=findItem(trip,b.getAttribute('data-id')); if(it.userDocs[0]) openFile(it.userDocs[0].fileId); } ); });
  page.querySelectorAll('[data-act="edit"]').forEach(function(b){ b.addEventListener('click', function(){ openItemSheet(b.getAttribute('data-id')); }); });
  page.querySelectorAll('[data-act="del"]').forEach(function(b){ b.addEventListener('click', function(){ deleteItem(trip, b.getAttribute('data-id')); }); });
}

function findItem(trip,id){ return trip.items.find(function(i){return i.id===id;}); }

function openFile(fileId){
  var url = fileUrl(fileId);
  if(!url){ toast('파일을 열 수 없어요'); return; }
  window.open(url, '_blank');
}

function deleteItem(trip, id){
  trip.items = trip.items.filter(function(i){return i.id!==id;});
  save(); render(); toast('일정을 삭제했어요');
}
