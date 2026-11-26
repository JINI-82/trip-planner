"use strict";

/* ---------- 백업 내보내기 · 가져오기 ----------
 * 파일은 기기 안에서만 만들고 읽는다. 외부로 보내지 않는다.
 * 형식: JSON 한 파일
 *   { app:'jplanner', version:2, exportedAt, state, files:{ id: {type, data:dataURL} } }
 * 옛 형식(state를 그대로 저장한 JSON, 사진은 dataURL로 안에 포함)도 읽는다.
 */
var BACKUP_APP = 'jplanner';
var BACKUP_VERSION = 2;

async function buildBackup(){
  var ids = Object.keys(referencedFileIds(state));
  var files = {};
  for(var i=0;i<ids.length;i++){
    var f = FILES[ids[i]];
    if(f) files[ids[i]] = {type:f.type, data: await blobToDataUrl(f.blob)};
  }
  var json = JSON.stringify({app:BACKUP_APP, version:BACKUP_VERSION, exportedAt:new Date().toISOString(), state:state, files:files});
  return new File([json], 'JP-백업-'+todayStr()+'.json', {type:'application/json'});
}

// 아이폰은 공유 시트('파일에 저장'), 안 되면 다운로드
async function saveBackupFile(file){
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file], title:file.name});
      return 'shared';
    }catch(e){
      if(e && e.name==='AbortError') return 'cancelled';
      // 공유 실패 → 다운로드로
    }
  }
  var url = URL.createObjectURL(file);
  var a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
  return 'downloaded';
}

// 백업 JSON 문자열 → 지금 데이터를 통째로 교체. 성공하면 true
async function importBackup(text){
  var data = JSON.parse(text);
  var st, newFiles = {};
  if(data && data.app===BACKUP_APP){
    if(typeof data.version!=='number' || data.version>BACKUP_VERSION) throw new Error('더 새 버전 앱에서 만든 백업이에요');
    st = normalizeState(data.state);
    var src = (data.files && typeof data.files==='object') ? data.files : {};
    Object.keys(src).forEach(function(id){
      var f = src[id];
      if(!RE_ID.test(id) || !f || typeof f.data!=='string' || !RE_DOC_DATA.test(f.data)) return;
      var blob = dataUrlToBlob(f.data);
      if(blob) newFiles[id] = blob;
    });
  } else {
    st = normalizeState(data); // 옛 형식
  }
  if(!st) return false;

  // 교체: 파일 저장소 비우고 새 파일 넣기
  await saveChain;
  await dbClearFiles();
  resetFiles();
  var ids = Object.keys(newFiles);
  for(var i=0;i<ids.length;i++){
    var b = newFiles[ids[i]];
    FILES[ids[i]] = {blob:b, type:b.type};
    await dbPutFile({id:ids[i], blob:b, type:b.type});
  }
  absorbLegacyFiles(st);
  dropMissingFiles(st);
  state = st;
  await save();
  return true;
}

function fmtBackupTime(ms){
  var d = new Date(ms);
  return (d.getMonth()+1)+'월 '+d.getDate()+'일 '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function renderBackupInfo(){
  var el = document.getElementById('backupInfo');
  dbGetMeta('lastBackupAt').then(function(ms){
    el.textContent = ms ? '마지막 백업: '+fmtBackupTime(ms) : '아직 백업한 적 없어요';
  }).catch(function(){ el.textContent = ''; });
}

document.getElementById('btnSettings').addEventListener('click', renderBackupInfo);

document.getElementById('setExport').addEventListener('click', async function(){
  try{
    var file = await buildBackup();
    var r = await saveBackupFile(file);
    if(r==='cancelled') return;
    await dbSetMeta('lastBackupAt', Date.now());
    renderBackupInfo();
    toast(r==='shared' ? '백업 파일을 저장했어요' : '백업 파일을 내려받았어요');
  }catch(e){ console.warn('백업 실패', e); toast('백업 파일을 만들지 못했어요'); }
});

document.getElementById('setImport').addEventListener('click', function(){ document.getElementById('importInput').click(); });
document.getElementById('importInput').addEventListener('change', function(e){
  var f = e.target.files[0]; if(!f) return;
  e.target.value='';
  f.text().then(importBackup).then(function(ok){
    if(!ok){ toast('올바른 백업 파일이 아니에요'); return; }
    selectedDay=null; render(); closeSheet('sheetSettings'); toast('백업을 불러왔어요');
  }).catch(function(err){
    console.warn('불러오기 실패', err);
    toast(err && err.message && /버전/.test(err.message) ? err.message : '파일을 읽을 수 없어요');
  });
});
