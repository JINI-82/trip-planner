"use strict";

/* ---------- 날짜 유틸 ---------- */
function pad(n){ return n<10?'0'+n:''+n; }
function fmtDate(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function parseDate(s){ var p=s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function addDays(d,n){ var r=new Date(d); r.setDate(r.getDate()+n); return r; }
function todayStr(){ return fmtDate(new Date()); }
function dateRange(startStr, endStr){
  var out=[]; var s=parseDate(startStr), e=parseDate(endStr);
  var cur=s;
  var guard=0;
  while(cur<=e && guard<60){ out.push(fmtDate(cur)); cur=addDays(cur,1); guard++; }
  return out;
}
function niceDate(s){
  var d=parseDate(s);
  return (d.getMonth()+1)+'월 '+d.getDate()+'일 ('+DOW[d.getDay()]+')';
}

/* ---------- 트립 헬퍼 ---------- */
function getTrip(){ return state.trips.find(function(t){return t.id===state.activeId;}); }
function getTripById(id){ return state.trips.find(function(t){return t.id===id;}); }

function calcSub(trip){
  var s=parseDate(trip.start), e=parseDate(trip.end);
  var nights = Math.max(0, Math.round((e-s)/86400000));
  var txt = niceDate(trip.start) + ' – ' + niceDate(trip.end) + ' · ' + (nights>0 ? nights+'박 '+(nights+1)+'일' : '당일치기');
  if(trip.note) txt += ' · ' + trip.note;
  return txt;
}
function calcDday(trip){
  var t=parseDate(todayStr()); var s=parseDate(trip.start); var e=parseDate(trip.end);
  var diff = Math.round((s-t)/86400000);
  if(t<s) return 'D-'+diff;
  if(t>e) return '여행 종료';
  if(fmtDate(t)===trip.start && diff===0) return 'D-DAY';
  var dayNo = Math.round((t-s)/86400000)+1;
  return '여행 '+dayNo+'일차';
}
function headerLabelText(trip){
  var y = parseDate(trip.start).getFullYear();
  if(trip.cities && trip.cities.length) return trip.cities.join(' · ') + ' · ' + y;
  return ''+y;
}
