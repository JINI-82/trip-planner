"use strict";

/* ---------- 화면 모드: 자동(아이폰 설정 따름) / 라이트 / 다크 ----------
 * 선택값은 이 기기 localStorage('jplanner_theme')에 저장.
 * 그리기 전 적용은 index.html <head>의 짧은 스크립트가 한다. */
var THEME_KEY = 'jplanner_theme';
var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function getThemePref(){
  var t = safeLS(function(){ return localStorage.getItem(THEME_KEY); }, null);
  return (t==='light' || t==='dark') ? t : 'auto';
}

function applyTheme(pref){
  var root = document.documentElement;
  if(pref==='auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  // 아이폰 상태바·주소창 색
  var meta = document.getElementById('themeColorMeta');
  if(meta) meta.setAttribute('content', isDarkNow() ? cssVar('--bg') : '#1b4b7a');
  document.querySelectorAll('#themeSeg button').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-theme-pref')===pref);
  });
}

function isDarkNow(){
  var pref = getThemePref();
  if(pref==='dark') return true;
  if(pref==='light') return false;
  return !!(darkQuery && darkQuery.matches);
}

function setThemePref(pref){
  safeLS(function(){
    if(pref==='auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref);
    return true;
  }, false);
  applyTheme(pref);
  if(state) render(); // 지도 경로 색 다시 그리기
}

document.querySelectorAll('#themeSeg button').forEach(function(b){
  b.addEventListener('click', function(){ setThemePref(b.getAttribute('data-theme-pref')); });
});
// '자동'일 때 아이폰 설정이 바뀌면 따라간다
if(darkQuery){
  var onSchemeChange = function(){ if(getThemePref()==='auto'){ applyTheme('auto'); if(state) render(); } };
  if(darkQuery.addEventListener) darkQuery.addEventListener('change', onSchemeChange);
  else if(darkQuery.addListener) darkQuery.addListener(onSchemeChange);
}

applyTheme(getThemePref());
