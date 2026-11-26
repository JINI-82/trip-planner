"use strict";

/* ---------- 상수 ---------- */
var CATS = {
  '항공': {emoji:'✈️', color:'#2c6fb0'},
  '숙소': {emoji:'🏨', color:'#7c5cbf'},
  '식당': {emoji:'🍜', color:'#d9724a'},
  '카페': {emoji:'☕️', color:'#a9762f'},
  '명소': {emoji:'🏯', color:'#2f9e6f'},
  '이동': {emoji:'🚗', color:'#3f7cb0'},
  '쇼핑': {emoji:'🛍️', color:'#c14f7c'},
  '기타': {emoji:'📌', color:'#6b7a89'}
};
var MOVES = {
  '도보':'🚶','지하철':'🚇','버스':'🚌','트램':'🚊','기차':'🚆','택시':'🚕','항공':'✈️','자전거':'🚲'
};
var DOW = ['일','월','화','수','목','금','토'];
var LS_KEY = 'jplanner_v1';

/* ---------- 상태 ---------- */
var state = null;
var selectedDay = null;
var editingItemId = null;
var editingFlightId = null;
var editingTripId = null;
var pendingAttachments = [];
var ovIndex = 0;
var ovAnimating = false;
var mapObj = null;
var mapLayers = { markers:[], routeSolid:null, routeDashed:null, char:null };

/* ---------- 저장/로드 ---------- */
function safeLS(fn, fallback){
  try { return fn(); } catch(e){ console.warn('localStorage 오류', e); return fallback; }
}
function load(){
  var raw = safeLS(function(){ return localStorage.getItem(LS_KEY); }, null);
  if(raw){
    try { return JSON.parse(raw); } catch(e){ console.warn('데이터 파싱 오류', e); }
  }
  return seedData();
}
function save(){
  safeLS(function(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); return true; }, false);
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function seedData(){
  var today = new Date();
  var start = new Date(today.getFullYear(), today.getMonth(), today.getDate()+7);
  var d0 = fmtDate(start), d1 = fmtDate(addDays(start,1)), d2 = fmtDate(addDays(start,2));
  var tripId = uid();
  return {
    trips: [{
      id: tripId,
      title: '도쿄 여행',
      start: d0, end: d2,
      note: '2인',
      cities: ['도쿄'],
      flights: [
        {id:uid(), fromCode:'ICN', toCode:'NRT', fromCity:'서울', toCity:'도쿄',
         fromTime:d0+'T09:20', toTime:d0+'T11:45', meta:'OZ102'}
      ],
      items: [
        {id:uid(), day:d0, time:'13:00', cat:'숙소', name:'긴자 호텔 체크인', place:'東京都中央区銀座', mapUrl:'',
         memo:'프론트에서 여권 제시', move:'택시', alarm:'', lat:35.6717, lng:139.7650, userDocs:[]},
        {id:uid(), day:d0, time:'15:30', cat:'명소', name:'센소지', place:'東京都台東区浅草 浅草寺', mapUrl:'',
         memo:'나카미세 거리 간식 구경하기', move:'지하철', alarm:'', lat:35.7148, lng:139.7967, userDocs:[]},
        {id:uid(), day:d0, time:'19:00', cat:'식당', name:'라멘 이치란 신주쿠점', place:'東京都新宿区 一蘭 新宿', mapUrl:'',
         memo:'', move:'도보', alarm:'18:40', lat:35.6905, lng:139.7005, userDocs:[]},
        {id:uid(), day:d1, time:'10:00', cat:'명소', name:'팀랩 플래닛츠', place:'東京都江東区 teamLab Planets', mapUrl:'',
         memo:'양말 챙기기, 예약 필수', move:'지하철', alarm:'09:30', lat:35.6465, lng:139.7938, userDocs:[]},
        {id:uid(), day:d1, time:'13:00', cat:'카페', name:'블루보틀 시부야', place:'東京都渋谷区 Blue Bottle Coffee', mapUrl:'',
         memo:'', move:'도보', alarm:'', lat:35.6595, lng:139.7005, userDocs:[]},
        {id:uid(), day:d1, time:'15:00', cat:'쇼핑', name:'시부야 스크램블 스퀘어', place:'東京都渋谷区 渋谷スクランブルスクエア', mapUrl:'',
         memo:'전망대 스카이도 방문', move:'도보', alarm:'', lat:35.6580, lng:139.7016, userDocs:[]},
        {id:uid(), day:d2, time:'09:00', cat:'명소', name:'메이지 신궁', place:'東京都渋谷区 明治神宮', mapUrl:'',
         memo:'', move:'지하철', alarm:'', lat:35.6764, lng:139.6993, userDocs:[]},
        {id:uid(), day:d2, time:'11:30', cat:'이동', name:'나리타공항 이동', place:'成田国際空港', mapUrl:'',
         memo:'리무진버스 탑승', move:'버스', alarm:'11:00', lat:35.7647, lng:140.3864, userDocs:[]}
      ]
    }],
    activeId: tripId
  };
}
