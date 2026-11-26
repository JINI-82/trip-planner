"use strict";

/* ---------- 구글 지도 설정 ----------
 * API 키는 웹앱 특성상 화면 코드에 드러난다. 보호는 구글 클라우드 콘솔의
 * 'HTTP 리퍼러(웹사이트) 제한' + 'API 제한' + API별 하루 할당량 상한으로 한다.
 * 키가 비어 있으면 지도 기능 없이 일정만 동작한다. */
var GOOGLE_MAPS_KEY = '';
// 클라우드 콘솔 '지도 관리'에서 만든 지도 ID (JavaScript · 벡터). 비어 있으면 테스트용 DEMO_MAP_ID
var GOOGLE_MAP_ID = '';

// 지도 언어·지역 (장소 이름을 한국어로 우선 표시)
var GOOGLE_MAPS_LANGUAGE = 'ko';
var GOOGLE_MAPS_REGION = 'KR';
