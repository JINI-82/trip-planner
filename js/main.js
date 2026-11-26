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
function init(){
  state = load();
  if(!state.activeId || !getTripById(state.activeId)) state.activeId = state.trips[0].id;
  selectedDay = null;
  setupManifest();
  render();
  checkAlarms();
}
init();
