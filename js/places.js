"use strict";

/* ---------- 장소 검색 (구글 Places, 새 버전) ----------
 * 일정 시트의 '장소' 칸에 글자를 치면 구글 자동완성 목록을 보여주고,
 * 고르면 장소 id·좌표·주소를 바로 받아 둔다 (좌표를 기다리는 시간이 없다).
 * 목록 없이 직접 친 글자는 저장할 때 텍스트 검색으로 좌표를 한 번 찾는다.
 * 요금 절약: 상세 정보는 location·formattedAddress(Essentials)만 받고,
 *           이름은 자동완성 결과의 mainText를 쓴다 (displayName은 Pro 등급). */
var pickedPlace = null;     // 시트에서 고른 장소 {placeId, lat, lng, address, text}
var placeSession = null;    // 자동완성 세션 토큰 (시트 한 번 = 세션 한 번)
var placeTimer = null;
var placeReqNo = 0;

function placeInput(){ return document.getElementById('itPlace'); }

// 시트 열 때 호출
function initPlaceField(it){
  pickedPlace = (it && it.placeId && it.lat!=null) ? {placeId:it.placeId, lat:it.lat, lng:it.lng, address:it.address||'', text:it.place} : null;
  placeSession = null;
  hidePlaceSuggest();
  renderPickedPlace();
}

function renderPickedPlace(){
  var el = document.getElementById('placePicked');
  if(pickedPlace){
    el.innerHTML = '📍 <b>'+escapeHtml(pickedPlace.text)+'</b>'+(pickedPlace.address ? '<span>'+escapeHtml(pickedPlace.address)+'</span>' : '');
    el.classList.remove('hide');
  } else {
    el.classList.add('hide');
  }
}

function hidePlaceSuggest(){
  var box = document.getElementById('placeSuggest');
  box.innerHTML = ''; box.classList.add('hide');
}

// 지금 여행 일정들 근처를 우선 보여주기 (좌표가 있으면)
function placeBias(){
  var trip = getTrip();
  var pts = trip ? trip.items.filter(function(i){ return i.lat!=null; }) : [];
  if(!pts.length) return undefined;
  var p = pts.find(function(i){ return i.day===selectedDay; }) || pts[0];
  return {center:{lat:p.lat, lng:p.lng}, radius:50000};
}

async function fetchPlaceSuggest(text){
  var no = ++placeReqNo;
  try{
    var g = await loadGoogleMaps();
    if(!placeSession) placeSession = new g.AutocompleteSessionToken();
    var req = {input:text, sessionToken:placeSession, language:GOOGLE_MAPS_LANGUAGE};
    var bias = placeBias(); if(bias) req.locationBias = bias;
    var res = await g.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
    if(no!==placeReqNo) return; // 더 새 입력이 있음
    showPlaceSuggest((res && res.suggestions) || []);
  }catch(e){
    if(!(e && e.message==='NO_KEY')) console.warn('장소 자동완성 실패', e);
    hidePlaceSuggest();
  }
}

function showPlaceSuggest(list){
  var box = document.getElementById('placeSuggest');
  box.innerHTML = '';
  list = list.filter(function(s){ return s.placePrediction; }).slice(0, 5);
  if(!list.length){ box.classList.add('hide'); return; }
  list.forEach(function(s){
    var pr = s.placePrediction;
    var main = pr.mainText ? pr.mainText.text : pr.text.text;
    var sub = pr.secondaryText ? pr.secondaryText.text : '';
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'sg';
    b.innerHTML = '<b>'+escapeHtml(main)+'</b>'+(sub ? '<span>'+escapeHtml(sub)+'</span>' : '');
    b.addEventListener('click', function(){ pickPlace(pr, main); });
    box.appendChild(b);
  });
  box.classList.remove('hide');
}

async function pickPlace(prediction, main){
  hidePlaceSuggest();
  placeInput().value = main;
  try{
    var place = prediction.toPlace();
    await place.fetchFields({fields:['location','formattedAddress']});
    pickedPlace = {placeId:place.id, lat:place.location.lat(), lng:place.location.lng(), address:place.formattedAddress||'', text:main};
    placeSession = null; // 세션 끝
    var nameEl = document.getElementById('itName');
    if(!nameEl.value.trim()) nameEl.value = main;
    renderPickedPlace();
  }catch(e){
    console.warn('장소 정보 받기 실패', e);
    toast('장소 정보를 받지 못했어요. 다시 골라주세요');
  }
}

placeInput().addEventListener('input', function(){
  var text = placeInput().value.trim();
  if(pickedPlace && text!==pickedPlace.text){ pickedPlace = null; renderPickedPlace(); }
  clearTimeout(placeTimer);
  if(text.length<2 || !hasMapsKey()){ hidePlaceSuggest(); return; }
  placeTimer = setTimeout(function(){ fetchPlaceSuggest(text); }, 300);
});

// 직접 친 글자 → 좌표 (텍스트 검색, location만 = Essentials 등급)
async function geocodeText(text){
  try{
    var g = await loadGoogleMaps();
    var res = await g.Place.searchByText({textQuery:text, fields:['location'], maxResultCount:1, language:GOOGLE_MAPS_LANGUAGE});
    var p = res && res.places && res.places[0];
    if(p && p.location) return {lat:p.location.lat(), lng:p.location.lng()};
  }catch(e){
    if(!(e && e.message==='NO_KEY')) console.warn('장소 검색 실패', e);
  }
  return null;
}

// 좌표 없는 일정(옛 데이터·직접 입력)을 한 번씩 찾아본다. 못 찾으면 geoMiss로 표시해 반복 요청 안 함
var geocodingIds = {};
async function geocodeMissing(trip, day){
  if(!hasMapsKey()) return;
  var targets = trip.items.filter(function(it){ return it.day===day && it.place && it.lat==null && !it.geoMiss && !geocodingIds[it.id]; });
  if(!targets.length) return;
  var changed = false;
  for(var i=0;i<targets.length;i++){
    var it = targets[i];
    geocodingIds[it.id] = true;
    var place = it.place;
    var pos = await geocodeText(place);
    delete geocodingIds[it.id];
    if(it.place!==place) continue;
    if(pos){ it.lat=pos.lat; it.lng=pos.lng; } else { it.geoMiss = true; }
    changed = true;
  }
  if(changed){
    save();
    if(getTrip()===trip && selectedDay===day && !document.getElementById('pageOverview').classList.contains('hide')) renderOverview(trip);
  }
}
