"use strict";

/* ---------- 구글 지도 로더 ----------
 * 구글 공식 'dynamic library import' 부트스트랩 (CDN 금지 규칙의 유일한 예외).
 * 키가 없으면 아무것도 불러오지 않는다. */
var gmaps = null;        // {Map, ColorScheme, AdvancedMarkerElement, Polyline, LatLngBounds, Route, Place, AutocompleteSuggestion, AutocompleteSessionToken}
var gmapsPromise = null;

function hasMapsKey(){ return !!(typeof GOOGLE_MAPS_KEY==='string' && GOOGLE_MAPS_KEY.trim()); }

function installMapsBootstrap(){
  /* eslint-disable */
  (g => {
    var h, a, k, p = "The Google Maps JavaScript API", c = "google",
        l = "importLibrary", q = "__ib__", m = document, b = window;
    b = b[c] || (b[c] = {});
    var d = b.maps || (b.maps = {}), r = new Set(), e = new URLSearchParams(),
        u = () => h || (h = new Promise(async (f, n) => {
          await (a = m.createElement("script"));
          e.set("libraries", [...r] + "");
          for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]);
          e.set("callback", c + ".maps." + q);
          a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
          d[q] = f;
          a.onerror = () => h = n(Error(p + " could not load."));
          a.nonce = m.querySelector("script[nonce]")?.nonce || "";
          m.head.append(a);
        }));
    d[l] ? console.warn(p + " only loads once. Ignoring:", g) :
      d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n));
  })({ key: GOOGLE_MAPS_KEY.trim(), v: "weekly", language: GOOGLE_MAPS_LANGUAGE, region: GOOGLE_MAPS_REGION });
  /* eslint-enable */
}

// 필요한 라이브러리를 한 번만 불러온다. 키가 없으면 reject('NO_KEY')
function loadGoogleMaps(){
  if(!hasMapsKey()) return Promise.reject(new Error('NO_KEY'));
  if(gmapsPromise) return gmapsPromise;
  installMapsBootstrap();
  var imp = google.maps.importLibrary;
  gmapsPromise = Promise.all([imp('maps'), imp('core'), imp('marker'), imp('routes'), imp('places')]).then(function(libs){
    gmaps = {
      Map: libs[0].Map, Polyline: libs[0].Polyline,
      ColorScheme: libs[1].ColorScheme, LatLngBounds: libs[1].LatLngBounds,
      AdvancedMarkerElement: libs[2].AdvancedMarkerElement,
      Route: libs[3].Route,
      Place: libs[4].Place, AutocompleteSuggestion: libs[4].AutocompleteSuggestion,
      AutocompleteSessionToken: libs[4].AutocompleteSessionToken
    };
    return gmaps;
  }).catch(function(e){ gmapsPromise = null; throw e; });
  return gmapsPromise;
}

/* ---------- 좌표 유틸 (앱 안에서는 [lat, lng] 배열로 다룬다) ---------- */
function toLL(p){ return {lat:p[0], lng:p[1]}; }
function distanceKm(a, b){
  var R=6371, toR=Math.PI/180;
  var dLat=(b[0]-a[0])*toR, dLng=(b[1]-a[1])*toR;
  var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a[0]*toR)*Math.cos(b[0]*toR)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.min(1, Math.sqrt(s)));
}
// 경로 좌표 정리: 소수 5자리(약 1m), 너무 많으면 솎아낸다 (저장 용량 절약)
function compactPath(pts, max){
  max = max || 600;
  var out = pts.map(function(p){ return [Math.round(p[0]*1e5)/1e5, Math.round(p[1]*1e5)/1e5]; });
  if(out.length<=max) return out;
  var step = (out.length-1)/(max-1), res=[];
  for(var i=0;i<max;i++) res.push(out[Math.round(i*step)]);
  return res;
}
