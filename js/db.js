"use strict";

/* ---------- IndexedDB 저장소 — 모든 데이터는 이 기기 안에만 ----------
 * meta 스토어 (key → value)
 *   'state'        : 여행 데이터 전체 (JSON 문자열)
 *   'lastBackupAt' : 마지막 백업 시각 (ms)
 * files 스토어 (keyPath 'id')
 *   { id, blob, type }  : 첨부(사진·PDF), 헤더 배경 사진
 *   state 안에는 파일 id만 들어간다 (item.userDocs[].fileId, trip.bgFile)
 */
var DB_NAME = 'jplanner';
var DB_VERSION = 1;
var dbPromise = null;

function dbOpen(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise(function(resolve, reject){
    if(!('indexedDB' in window)){ reject(new Error('IndexedDB 미지원')); return; }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(){
      var db = req.result;
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if(!db.objectStoreNames.contains('files')) db.createObjectStore('files', {keyPath:'id'});
    };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ dbPromise = null; reject(req.error); };
    req.onblocked = function(){ reject(new Error('다른 탭이 저장소를 쓰고 있어요. 다른 탭을 닫아주세요.')); };
  });
  return dbPromise;
}

function dbRun(store, mode, fn){
  return dbOpen().then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(store, mode);
      var req = fn(tx.objectStore(store));
      var result;
      if(req) req.onsuccess = function(){ result = req.result; };
      tx.oncomplete = function(){ resolve(result); };
      tx.onerror = function(){ reject(tx.error); };
      tx.onabort = function(){ reject(tx.error || new Error('저장이 취소됐어요')); };
    });
  });
}

function dbGetMeta(key){ return dbRun('meta', 'readonly', function(s){ return s.get(key); }); }
function dbSetMeta(key, value){ return dbRun('meta', 'readwrite', function(s){ return s.put(value, key); }); }
function dbAllFiles(){ return dbRun('files', 'readonly', function(s){ return s.getAll(); }).then(function(v){ return v||[]; }); }
function dbPutFile(rec){ return dbRun('files', 'readwrite', function(s){ return s.put(rec); }); }
function dbDeleteFile(id){ return dbRun('files', 'readwrite', function(s){ return s.delete(id); }); }
function dbClearFiles(){ return dbRun('files', 'readwrite', function(s){ return s.clear(); }); }

// 브라우저가 저장소를 마음대로 정리하지 않게 요청 (지원할 때만)
function requestPersist(){
  try{ if(navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function(){ return false; }); }catch(e){}
  return Promise.resolve(false);
}

/* ---------- 파일(첨부·배경) 메모리 캐시 ----------
 * 화면은 동기로 그리기 때문에 시작할 때 파일을 모두 읽어두고 blob URL로 쓴다. */
var FILES = {}; // id → {blob, type, url}

function fileUrl(id){
  var f = FILES[id];
  if(!f) return '';
  if(!f.url) f.url = URL.createObjectURL(f.blob);
  return f.url;
}
function fileType(id){ return FILES[id] ? FILES[id].type : ''; }
function isPdfFile(id){ return fileType(id)==='application/pdf'; }

// 새 파일 등록: 메모리에 바로 넣고 DB에는 뒤에서 저장. id를 돌려준다
function addFile(blob){
  var id = 'f' + uid();
  var type = blob.type || 'application/octet-stream';
  FILES[id] = {blob:blob, type:type};
  dbPutFile({id:id, blob:blob, type:type}).catch(storageError);
  return id;
}

function loadAllFiles(){
  return dbAllFiles().then(function(list){
    list.forEach(function(f){ if(f && f.id && f.blob) FILES[f.id] = {blob:f.blob, type:f.type||f.blob.type||''}; });
  });
}

function resetFiles(){
  Object.keys(FILES).forEach(function(id){ if(FILES[id].url) URL.revokeObjectURL(FILES[id].url); });
  FILES = {};
}

// state가 쓰는 파일 id 목록
function referencedFileIds(st){
  var ids = {};
  (st.trips||[]).forEach(function(t){
    if(t.bgFile) ids[t.bgFile] = true;
    (t.items||[]).forEach(function(it){ (it.userDocs||[]).forEach(function(d){ if(d.fileId) ids[d.fileId] = true; }); });
    (t.visits||[]).forEach(function(v){ (v.photos||[]).forEach(function(p){ if(p.fileId) ids[p.fileId] = true; }); });
  });
  return ids;
}

// 아무 데도 안 쓰는 파일 정리 (일정·여행 삭제, 첨부 취소 등으로 남은 것)
function pruneFiles(){
  var used = referencedFileIds(state);
  Object.keys(FILES).forEach(function(id){
    if(!used[id]){
      if(FILES[id].url) URL.revokeObjectURL(FILES[id].url);
      delete FILES[id];
      dbDeleteFile(id).catch(function(e){ console.warn('파일 정리 실패', e); });
    }
  });
}

// 실제 파일이 없는 참조 제거
function dropMissingFiles(st){
  st.trips.forEach(function(t){
    if(t.bgFile && !FILES[t.bgFile]) delete t.bgFile;
    t.items.forEach(function(it){ it.userDocs = (it.userDocs||[]).filter(function(d){ return !d.fileId || FILES[d.fileId]; }); });
    (t.visits||[]).forEach(function(v){ v.photos = (v.photos||[]).filter(function(p){ return FILES[p.fileId]; }); });
  });
}

// 옛 형식(dataURL을 state 안에 통째로 저장)을 파일로 옮긴다
function absorbLegacyFiles(st){
  st.trips.forEach(function(t){
    if(t.bgImage){
      var b = dataUrlToBlob(t.bgImage);
      if(b) t.bgFile = addFile(b);
      delete t.bgImage;
    }
    t.items.forEach(function(it){
      it.userDocs = (it.userDocs||[]).map(function(d){
        if(d.fileId) return d;
        var blob = d.data ? dataUrlToBlob(d.data) : null;
        return blob ? {name:d.name, fileId:addFile(blob)} : null;
      }).filter(Boolean);
    });
  });
}

function dataUrlToBlob(u){
  var m = /^data:([a-z0-9.+\/-]+);base64,(.*)$/i.exec(u||'');
  if(!m) return null;
  try{
    var bin = atob(m[2]);
    var bytes = new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], {type:m[1]});
  }catch(e){ return null; }
}
function blobToDataUrl(blob){
  return new Promise(function(resolve, reject){
    var fr = new FileReader();
    fr.onload = function(){ resolve(fr.result); };
    fr.onerror = function(){ reject(fr.error); };
    fr.readAsDataURL(blob);
  });
}

function storageError(e){
  console.warn('저장 실패', e);
  toast('저장에 실패했어요. 기기 저장 공간을 확인해주세요');
}
