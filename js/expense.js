"use strict";

/* ---------- 가계부(CSV) → 실제 방문에 '얼마 씀' 붙이기 ----------
 * 한 줄 = 지출 하나. 앞뒤 30분 안에 방문이 있으면 그 방문에 붙이고,
 * 없으면 위치 없는 방문(source 'expense')을 새로 만든다.
 * 나중에 같은 시간대 사진(GPS)을 넣으면 그 방문에 위치가 채워진다. */
var CUR_TZ = { HKD:'+08:00', MOP:'+08:00', CNY:'+08:00', TWD:'+08:00', SGD:'+08:00', PHP:'+08:00', MYR:'+08:00',
  KRW:'+09:00', JPY:'+09:00', THB:'+07:00', VND:'+07:00', IDR:'+07:00' };

function hasLoc(v){ return v.lat!=null && v.lng!=null; }

// 따옴표·쉼표·줄바꿈을 지원하는 CSV 파서
function parseCsv(text){
  text = text.replace(/^\uFEFF/, '');
  var rows = [], row = [], cell = '', q = false;
  for(var i=0;i<text.length;i++){
    var c = text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if(c==='"') q = true;
    else if(c===','){ row.push(cell); cell = ''; }
    else if(c==='\n' || c==='\r'){
      if(c==='\r' && text[i+1]==='\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += c;
  }
  if(cell!=='' || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(x){ return x.trim()!==''; }); });
}

// CSV 글 → 지출 목록. 형식이 다르면 null
function readExpenseRows(text){
  var rows = parseCsv(text);
  if(rows.length<2) return null;
  var h = rows[0].map(function(x){ return x.trim(); });
  var col = function(name){ return h.indexOf(name); };
  var c = { day:col('날짜'), time:col('시간'), type:col('거래 유형'), cat:col('카테고리'), amount:col('금액'),
    cur:col('화폐'), krw:col('환산 금액'), title:col('제목'), memo:col('메모') };
  if(c.day<0 || c.time<0 || c.amount<0 || c.title<0) return null;
  return rows.slice(1).map(function(r){
    var g = function(i){ return i<0 ? '' : (r[i]||'').trim(); };
    var time = g(c.time).slice(0,5);
    if(/^\d:\d{2}$/.test(time)) time = '0'+time;
    return { day:g(c.day), time:time, type:g(c.type), cat:g(c.cat), amount:parseFloat(g(c.amount)),
      cur:g(c.cur).toUpperCase(), krw:parseFloat(g(c.krw)), title:g(c.title).slice(0,100), memo:g(c.memo).slice(0,200) };
  });
}

function importExpenses(trip, rows){
  var stats = {added:0, newVisits:0, attached:0, dup:0, outOfTrip:0, skipped:0};
  var range = dateRange(trip.start, trip.end);
  var known = {};
  tripVisits(trip).forEach(function(v){ (v.spends||[]).forEach(function(s){ known[s.key] = true; }); });
  rows.forEach(function(r){
    if(!RE_DAY.test(r.day) || !RE_TIME.test(r.time) || !r.title){ stats.skipped++; return; }
    if(r.type && r.type!=='지출'){ stats.skipped++; return; }
    if(!(r.amount>0)){ stats.skipped++; return; }
    if(range.indexOf(r.day)===-1){ stats.outOfTrip++; return; }
    var key = r.day+'|'+r.time+'|'+r.title+'|'+r.amount+'|'+r.cur;
    if(known[key]){ stats.dup++; return; }
    known[key] = true;
    // 시간대: 같은 여행 다른 방문 → 화폐 → 폰 설정
    var tz = tzFromNeighbors(trip, r.day, r.time) || CUR_TZ[r.cur] || minToTz(-new Date().getTimezoneOffset());
    var ms = localToMs(r.day, r.time, tz);
    var spend = { key:key, title:r.title, cat:r.cat.slice(0,20), amount:r.amount, cur:r.cur.slice(0,5),
      krw: r.krw>0 ? Math.round(r.krw) : null, memo:r.memo };
    // 위치 있는 방문은 30분 안이면 붙이고, 위치 없는 방문은 같은 제목일 때만 붙인다
    var cands = tripVisits(trip).filter(function(v){
      if(Math.abs(v.ms-ms) > VISIT_NEAR_MS) return false;
      return hasLoc(v) || v.photos.length || (v.spends||[]).some(function(s){ return s.title===r.title; });
    }).sort(function(a,b){ return Math.abs(a.ms-ms) - Math.abs(b.ms-ms); });
    var v = cands[0];
    if(v){ stats.attached++; if(!v.name) v.name = r.title; }
    else {
      v = { id:uid(), day:r.day, time:r.time, tz:tz, ms:ms, lat:null, lng:null, name:r.title, memo:'', move:'',
        source:'expense', photos:[], spends:[] };
      tripVisits(trip).push(v); stats.newVisits++;
    }
    v.spends = v.spends || [];
    v.spends.push(spend);
    stats.added++;
  });
  sortVisits(trip);
  return stats;
}

function expenseImportMessage(s){
  var parts = ['지출 '+s.added+'건 추가'];
  if(s.attached) parts.push('기존 방문에 '+s.attached+'건');
  if(s.newVisits) parts.push('새 방문 '+s.newVisits+'곳');
  var skip = [];
  if(s.dup) skip.push('이미 넣음 '+s.dup);
  if(s.outOfTrip) skip.push('여행 기간 밖 '+s.outOfTrip);
  if(s.skipped) skip.push('0원·기타 '+s.skipped);
  return parts.join(' · ') + (skip.length ? ' (건너뜀: '+skip.join(', ')+'건)' : '');
}

function wonText(n){ return n>=10000 ? (Math.round(n/1000)/10)+'만원' : Math.round(n).toLocaleString('ko-KR')+'원'; }
function amountText(s){
  var a = Number.isInteger(s.amount) ? s.amount : s.amount.toFixed(2);
  return s.cur==='KRW' ? wonText(s.amount) : a+' '+s.cur+(s.krw ? ' ('+wonText(s.krw)+')' : '');
}
function spendKrw(s){ return s.krw!=null ? s.krw : (s.cur==='KRW' ? s.amount : 0); }

document.getElementById('btnCsv').addEventListener('click', function(){ document.getElementById('csvInput').click(); });
document.getElementById('csvInput').addEventListener('change', async function(e){
  var file = (e.target.files||[])[0];
  e.target.value = '';
  if(!file) return;
  try{
    var rows = readExpenseRows(await file.text());
    if(!rows){ toast('가계부 형식이 아니에요 (날짜·시간·금액·제목 열이 필요해요)'); return; }
    var trip = getTrip();
    var s = importExpenses(trip, rows);
    save();
    if(s.added){
      var days = tripVisits(trip).map(function(v){ return v.day; });
      if(days.indexOf(selectedDay)===-1) selectedDay = days[0];
    }
    render();
    toast(expenseImportMessage(s));
  }catch(err){
    console.warn('가계부 넣기 실패', err);
    toast('가계부를 넣지 못했어요');
  }
});
