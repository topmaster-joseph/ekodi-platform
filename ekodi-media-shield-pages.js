// EKODI-MEDIA-SHIELD-002 — 보호 영상 관리(스튜디오)·시청 화면
//
// /admin/media-shield  관리자: 유튜브·비메오에 올린 영상의 링크를 등록하고 볼 수 있는 사람을 정한다.
//                      EKODI-MEDIA-SHIELD-003(소유자 정책 2026-11-21): 영상 파일은 에코디 서버에
//                      저장하지 않는다. 에코디에는 제목·링크·공개범위만 남는다.
// /my/media/<id>       시청: EKODI 로그인 + 시청권한 확인 후 Media Shield 플레이어로 재생.
// Client scripts are plain source strings (never Function#toString — wrangler keep_names).

import { EXTERNAL_VIDEO_FRAME_ORIGINS, isValidContentId } from './ekodi-media-shield.js';

export const MEDIA_STUDIO_PATH='/admin/media-shield';
const WATCH_PREFIX='/my/media/';
const ASSET={
  studio:'/__ekodi/media-studio.js',
  watch:'/__ekodi/media-watch.js',
  css:'/__ekodi/media-pages.css',
};

const PAGE_CSP=`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-src ${EXTERNAL_VIDEO_FRAME_ORIGINS.join(' ')}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

const CSS=`/* EKODI Media Shield pages */
.ms{margin:0;background:#f6f7f9;color:#1d2433;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}
.ms-wrap{max-width:960px;margin:0 auto;padding:28px 20px 60px}
.ms h1{font-size:24px;margin:0 0 6px}.ms h2{font-size:18px;margin:0 0 14px}
.ms-lead{color:#5b6475;margin:0 0 22px}
.ms-card{background:#fff;border:1px solid #e3e6ec;border-radius:12px;padding:20px;margin:0 0 18px}
.ms label{display:block;margin:0 0 12px;font-weight:600}
.ms input[type=text],.ms textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:9px 11px;border:1px solid #cfd5df;border-radius:8px;font:inherit}
.ms input[type=file]{display:block;margin-top:6px}
.ms fieldset{border:0;padding:0;margin:0 0 14px}.ms legend{font-weight:600;margin-bottom:6px}
.ms fieldset label{font-weight:400;margin:4px 0}
.ms textarea{min-height:90px}
.ms button{background:#1f4fd1;color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer}
.ms button:disabled{background:#9aa5bd;cursor:default}
.ms button.ms-danger{background:#fff;color:#c0392b;border:1px solid #e3b7b1;padding:5px 10px;font-weight:500}
.ms progress{width:100%;height:12px}
.ms-status{margin-top:8px;color:#384152}
.ms-ok{color:#18794e}.ms-err{color:#c0392b}
.ms table{width:100%;border-collapse:collapse;font-size:14px}
.ms th,.ms td{text-align:left;padding:9px 6px;border-bottom:1px solid #edf0f4;vertical-align:middle}
.ms th{color:#5b6475;font-weight:600}
.ms a{color:#1f4fd1}
.ms-player{position:relative;background:#000;border-radius:12px;overflow:hidden}
.ms-player video,.ms-player iframe{display:block;width:100%;max-height:70vh;background:#000}
.ms-help{color:#5b6475;font-size:13px;margin:-6px 0 12px}
.ms-note{color:#5b6475;font-size:13px;margin-top:12px}
.ms-banner{padding:12px 14px;border-radius:8px;background:#fff4e5;border:1px solid #f3d19e;margin:0 0 18px}
`;

function page(title,body,scripts){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${title} · EKODI</title><link rel="stylesheet" href="${ASSET.css}"></head><body class="ms">${body}${scripts.map(src=>`<script src="${src}"></script>`).join('')}</body></html>`;
}

const STUDIO_HTML=page('보호 영상 관리',`<main class="ms-wrap">
<h1>보호 영상 관리</h1>
<p class="ms-lead">영상 파일은 에코디 서버에 저장하지 않습니다. 유튜브(또는 비메오)에 올린 영상의 주소를 등록하면, 허락한 사람만 에코디 시청 화면에서 볼 수 있습니다.</p>
<p class="ms-banner" id="auth" hidden>관리자 로그인이 필요합니다. <a href="/admin">에코디 관리자 화면</a>에서 로그인한 뒤, 같은 창에서 이 주소를 다시 열어 주세요.</p>
<section class="ms-card">
<h2>영상 링크 등록</h2>
<label>영상 주소<input type="text" id="url" inputmode="url" autocomplete="off" placeholder="https://youtu.be/... 또는 https://www.youtube.com/watch?v=..."></label>
<p class="ms-help">유튜브에서는 공개 상태를 <b>일부 공개</b>로 두세요. 검색에 나오지 않고 에코디 화면에서만 안내됩니다. <b>비공개</b>는 다른 사이트에서 재생되지 않습니다.</p>
<label>제목<input type="text" id="title" maxlength="120" autocomplete="off"></label>
<fieldset><legend>볼 수 있는 사람</legend>
<label><input type="radio" name="aud" value="members" checked> 에코디에 로그인한 회원 모두</label>
<label><input type="radio" name="aud" value="subjects"> 지정한 사람만 (이메일)</label>
<textarea id="subjects" placeholder="이메일을 한 줄에 하나씩 입력" hidden></textarea>
</fieldset>
<button id="start" type="button">등록하기</button>
<div class="ms-status" id="status"></div>
</section>
<section class="ms-card"><h2>등록된 보호 영상</h2><div id="list">불러오는 중…</div></section>
</main>`,[ASSET.studio]);

function watchHtml(contentId){
  return page('보호 영상',`<main class="ms-wrap">
<h1 id="title">보호 영상</h1>
<div class="ms-player"><video id="video" controls playsinline preload="none" data-ekodi-media="${contentId}"></video></div>
<p class="ms-status" id="msg">영상을 준비하고 있습니다…</p>
<p class="ms-note">에코디 보호 영상입니다. 화면에 시청자 표시가 나타나며, 녹화·유출 시 추적될 수 있습니다.</p>
</main>`,['/__ekodi/media-shield-player.js',ASSET.watch]);
}

const STUDIO_SOURCE=String.raw`(function(){
  'use strict';
  var API='/api/media-shield/admin/';
  var $=function(id){return document.getElementById(id);};
  var PROVIDER={youtube:'유튜브',vimeo:'비메오',ekodi:'에코디 저장(이전 방식)'};
  function auth(){try{return sessionStorage.getItem('ekodi-auth-token')||localStorage.getItem('ekodi-auth-token')||'';}catch(e){return '';}}
  function call(method,path,body){
    var headers={authorization:'Bearer '+auth()};
    if(body!==undefined)headers['content-type']='application/json';
    return fetch(API+path,{method:method,headers:headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store'}).then(function(r){
      return r.json().catch(function(){return {};}).then(function(j){
        if(r.status===401)$('auth').hidden=false;
        if(!r.ok||!j.ok){var e=new Error(j.error||('요청 실패 ('+r.status+')'));e.code=j.code;throw e;}
        return j;
      });
    });
  }
  function status(text,kind){var el=$('status');el.textContent=text;el.className='ms-status'+(kind?' ms-'+kind:'');}
  function text(tag,value){var el=document.createElement(tag);el.textContent=value;return el;}
  function loadList(){
    return call('GET','list').then(function(j){
      var box=$('list');box.textContent='';
      var items=j.items.filter(function(item){return item.status==='published';});
      if(!items.length){box.textContent='아직 등록된 보호 영상이 없습니다.';return;}
      var table=document.createElement('table');
      var head=document.createElement('tr');['제목','영상 위치','볼 수 있는 사람','등록일',''].forEach(function(h){head.appendChild(text('th',h));});
      table.appendChild(head);
      items.forEach(function(item){
        var tr=document.createElement('tr');
        var cell=document.createElement('td');var a=document.createElement('a');a.href='/my/media/'+item.contentId;a.textContent=item.title;cell.appendChild(a);tr.appendChild(cell);
        tr.appendChild(text('td',PROVIDER[item.provider]||item.provider||'-'));
        tr.appendChild(text('td',item.audience==='members'?'로그인 회원 모두':'지정 '+item.subjects+'명'));
        tr.appendChild(text('td',item.publishedAt?item.publishedAt.slice(0,10):'-'));
        var actions=document.createElement('td');
        var copy=document.createElement('button');copy.type='button';copy.className='ms-danger';copy.textContent='주소 복사';
        copy.addEventListener('click',function(){var link=location.origin+'/my/media/'+item.contentId;(navigator.clipboard?navigator.clipboard.writeText(link):Promise.reject()).then(function(){copy.textContent='복사됨';},function(){prompt('시청 주소',link);});});
        var del=document.createElement('button');del.type='button';del.className='ms-danger';del.textContent='삭제';
        del.addEventListener('click',function(){
          if(!confirm('"'+item.title+'" 등록을 삭제합니다. 유튜브의 영상은 그대로 남습니다. 계속할까요?'))return;
          del.disabled=true;
          call('DELETE','content/'+item.contentId).then(loadList,function(e){del.disabled=false;alert(e.message);});
        });
        actions.appendChild(copy);actions.appendChild(document.createTextNode(' '));actions.appendChild(del);tr.appendChild(actions);
        table.appendChild(tr);
      });
      box.appendChild(table);
    },function(e){$('list').textContent=e.message;});
  }
  function register(){
    var url=$('url').value.trim();
    if(!url){alert('영상 주소를 입력해 주세요.');return;}
    var audience=document.querySelector('input[name=aud]:checked').value;
    var subjects=$('subjects').value;
    if(audience==='subjects'&&!subjects.trim()){alert('볼 수 있는 사람의 이메일을 입력해 주세요.');return;}
    $('start').disabled=true;status('등록하고 있습니다…');
    call('POST','link',{url:url,title:$('title').value,audience:audience,subjects:subjects}).then(function(j){
      var el=$('status');el.className='ms-status ms-ok';el.textContent='등록되었습니다. 시청 주소: ';
      var a=document.createElement('a');a.href=j.watchPath;a.textContent=location.origin+j.watchPath;el.appendChild(a);
      $('url').value='';$('title').value='';
      loadList();
    },function(e){status(e.message,'err');}).then(function(){$('start').disabled=false;});
  }
  document.querySelectorAll('input[name=aud]').forEach(function(r){r.addEventListener('change',function(){$('subjects').hidden=document.querySelector('input[name=aud]:checked').value!=='subjects';});});
  $('start').addEventListener('click',register);
  if(!auth())$('auth').hidden=false;
  loadList();
})();`;

const WATCH_SOURCE=String.raw`(function(){
  'use strict';
  var video=document.getElementById('video'),msg=document.getElementById('msg');
  var messages={AUTH_REQUIRED:'로그인이 필요합니다.',CONTENT_FORBIDDEN:'이 영상을 볼 권한이 없습니다. 영상을 올린 관리자에게 문의해 주세요.',CONTENT_NOT_FOUND:'영상을 찾을 수 없습니다.',MEDIA_SHIELD_NOT_CONFIGURED:'보호 영상 서비스가 준비 중입니다.',UNSUPPORTED_FORMAT:'이 브라우저에서는 재생할 수 없습니다. 최신 크롬·엣지·사파리에서 열어 주세요.'};
  function show(error){
    msg.className='ms-status ms-err';msg.textContent=messages[error&&error.code]||(error&&error.message)||'재생을 준비하지 못했습니다.';
    if(error&&error.code==='AUTH_REQUIRED'){msg.appendChild(document.createTextNode(' '));var a=document.createElement('a');a.href='/auth/';a.textContent='로그인하기';msg.appendChild(a);}
  }
  if(!window.EkodiMediaShield){show();return;}
  video.addEventListener('playing',function(){if(msg.className==='ms-status')msg.textContent='';});
  window.EkodiMediaShield.mount(video).then(function(r){msg.className='ms-status';msg.textContent=r&&r.kind==='link'?'':'재생 버튼을 눌러 시청하세요.';},show);
})();`;

function asset(body,type){
  return new Response(body,{status:200,headers:{'content-type':type,'cache-control':'public, max-age=600','x-content-type-options':'nosniff','x-ekodi-route':'media-shield-page-asset'}});
}
function html(body){
  return new Response(body,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':PAGE_CSP,'x-robots-tag':'noindex, nofollow, noarchive','x-ekodi-route':'media-shield-page'}});
}

/** Early router hook. Returns null when the path is not a Media Shield page or asset. */
export function mediaShieldPageResponse(request){
  const method=String(request.method||'GET').toUpperCase();
  if(method!=='GET'&&method!=='HEAD')return null;
  const path=new URL(request.url).pathname;
  if(path===ASSET.studio)return asset(STUDIO_SOURCE,'text/javascript; charset=utf-8');
  if(path===ASSET.watch)return asset(WATCH_SOURCE,'text/javascript; charset=utf-8');
  if(path===ASSET.css)return asset(CSS,'text/css; charset=utf-8');
  if(path===MEDIA_STUDIO_PATH||path===MEDIA_STUDIO_PATH+'/')return html(STUDIO_HTML);
  if(path.startsWith(WATCH_PREFIX)){
    const contentId=path.slice(WATCH_PREFIX.length).replace(/\/$/,'').toLowerCase();
    if(isValidContentId(contentId))return html(watchHtml(contentId));
  }
  return null;
}

export const MEDIA_SHIELD_PAGE_SCRIPTS=Object.freeze({studio:STUDIO_SOURCE,watch:WATCH_SOURCE});
