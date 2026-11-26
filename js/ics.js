"use strict";

/* ---------- ICS ---------- */
function pad2(n){return n<10?'0'+n:''+n;}
function icsDate(dayStr, timeStr){
  var d = parseDate(dayStr);
  var hm = (timeStr||'09:00').split(':');
  return d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'T'+pad2(+hm[0])+pad2(+hm[1])+'00';
}
function downloadIcsForItems(items, label){
  var lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//J플래너//KO'];
  items.forEach(function(it){
    var startDt = icsDate(it.day, it.time);
    var endDate = addDays(parseDate(it.day),0);
    var endHm = (it.time||'09:00').split(':');
    var endMin = (+endHm[0]*60+ +endHm[1]+60);
    var endH = Math.floor(endMin/60)%24, endM = endMin%60;
    var endDt = it.day.replace(/-/g,'')+'T'+pad2(endH)+pad2(endM)+'00';
    lines.push('BEGIN:VEVENT');
    lines.push('UID:'+it.id+'@jplanner');
    lines.push('SUMMARY:'+(it.name||'').replace(/\n/g,' '));
    lines.push('DESCRIPTION:'+(it.memo||'').replace(/\n/g,' '));
    lines.push('LOCATION:'+(it.place||'').replace(/\n/g,' '));
    lines.push('DTSTART:'+startDt);
    lines.push('DTEND:'+endDt);
    if(it.alarm){
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push('DESCRIPTION:'+it.name);
      lines.push('TRIGGER:'+alarmTrigger(it.day, it.time, it.alarm));
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  var blob = new Blob([lines.join('\r\n')], {type:'text/calendar'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href=url; a.download=(label||'schedule')+'.ics'; a.click();
  toast('캘린더 파일을 내보냈어요');
}
function alarmTrigger(day, time, alarmTime){
  var evMin = timeToMin(time), alMin = timeToMin(alarmTime);
  var diff = evMin - alMin;
  if(diff<0) diff=0;
  return '-PT'+diff+'M';
}
function timeToMin(t){ var p=(t||'00:00').split(':'); return (+p[0])*60+(+p[1]); }
