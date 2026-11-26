"use strict";

/* ---------- 알람 ---------- */
function beep(){
  try{
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
    var o = ctx.createOscillator(); var g = ctx.createGain();
    o.type='sine'; o.frequency.value=880;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.35);
    o.start(); o.stop(ctx.currentTime+0.4);
  }catch(e){}
}
function checkAlarms(){
  if(!state) return;
  var now = new Date();
  var todayS = fmtDate(now);
  var nowHM = pad(now.getHours())+':'+pad(now.getMinutes());
  state.trips.forEach(function(trip){
    trip.items.forEach(function(it){
      if(it.alarm && it.day===todayS && it.alarm===nowHM && !it.alarmFired){
        it.alarmFired = true;
        showAlarmPopup(it);
        beep();
        if('Notification' in window && Notification.permission==='granted'){
          try{ new Notification('⏰ '+it.name, {body:(it.time)+' 일정 알림'}); }catch(e){}
        }
      }
    });
  });
  save();
}
function showAlarmPopup(it){
  document.getElementById('alarmText').textContent = '⏰ '+it.time+' '+it.name+' 일정 시간이에요! (앱이 열려 있을 때만 알려드려요)';
  document.getElementById('alarmpop').classList.add('show');
}
document.getElementById('alarmClose').addEventListener('click', function(){ document.getElementById('alarmpop').classList.remove('show'); });
setInterval(checkAlarms, 15000);
