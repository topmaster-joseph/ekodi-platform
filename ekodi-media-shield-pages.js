// EKODI-MEDIA-SHIELD-002 — 보호 영상 관리(스튜디오)·시청 화면
//
// /admin/media-shield  관리자: MP4를 고르면 이 브라우저 안에서 조각내고(mp4box.js) 암호화해
//                      암호문만 올린다. 원본과 콘텐츠 키는 서버에 남지 않는다(키는 관리자
//                      브라우저의 비추출 CryptoKey로만 존재). 서버(Workers)는 저장만 해서
//                      CPU·요청 한도를 아낀다.
// /my/media/<id>       시청: EKODI 로그인 + 시청권한 확인 후 Media Shield 플레이어로 재생.
// Client scripts are plain source strings (never Function#toString — wrangler keep_names).

import { MP4BOX_SOURCE } from './vendor/mp4box/mp4box-source.js';
import { isValidContentId } from './ekodi-media-shield.js';

export const MEDIA_STUDIO_PATH='/admin/media-shield';
const WATCH_PREFIX='/my/media/';
const ASSET={
  mp4box:'/__ekodi/mp4box.js',
  studio:'/__ekodi/media-studio.js',
  watch:'/__ekodi/media-watch.js',
  css:'/__ekodi/media-pages.css',
};

const PAGE_CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

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
.ms-player video{display:block;width:100%;max-height:70vh;background:#000}
.ms-note{color:#5b6475;font-size:13px;margin-top:12px}
.ms-banner{padding:12px 14px;border-radius:8px;background:#fff4e5;border:1px solid #f3d19e;margin:0 0 18px}
`;

function page(title,body,scripts){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${title} · EKODI</title><link rel="stylesheet" href="${ASSET.css}"></head><body class="ms">${body}${scripts.map(src=>`<script src="${src}"></script>`).join('')}</body></html>`;
}

const STUDIO_HTML=page('보호 영상 관리',`<main class="ms-wrap">
<h1>보호 영상 관리</h1>
<p class="ms-lead">고른 영상은 이 컴퓨터의 브라우저 안에서 바로 암호화된 뒤 올라갑니다. 원본 파일과 암호 열쇠는 서버에 남지 않습니다.</p>
<p class="ms-banner" id="auth" hidden>관리자 로그인이 필요합니다. <a href="/admin">에코디 관리자 화면</a>에서 로그인한 뒤, 같은 창에서 이 주소를 다시 열어 주세요.</p>
<section class="ms-card" id="upload">
<h2>새 영상 올리기</h2>
<label>영상 파일 (MP4·MOV)<input type="file" id="file" accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"></label>
<label>제목<input type="text" id="title" maxlength="120" autocomplete="off"></label>
<fieldset><legend>볼 수 있는 사람</legend>
<label><input type="radio" name="aud" value="members" checked> 에코디에 로그인한 회원 모두</label>
<label><input type="radio" name="aud" value="subjects"> 지정한 사람만 (이메일)</label>
<textarea id="subjects" placeholder="이메일을 한 줄에 하나씩 입력" hidden></textarea>
</fieldset>
<button id="start" type="button">암호화해서 올리기</button>
<div id="progress" hidden><progress id="bar" max="100" value="0"></progress><div class="ms-status" id="status"></div></div>
</section>
<section class="ms-card"><h2>등록된 보호 영상</h2><div id="list">불러오는 중…</div></section>
</main>`,[ASSET.mp4box,ASSET.studio]);

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
  var te=new TextEncoder();
  var $=function(id){return document.getElementById(id);};
  var busy=false;
  function auth(){try{return sessionStorage.getItem('ekodi-auth-token')||localStorage.getItem('ekodi-auth-token')||'';}catch(e){return '';}}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
  function b64(value){var t=String(value).replace(/-/g,'+').replace(/_/g,'/');var s=atob(t+'='.repeat((4-t.length%4)%4));var o=new Uint8Array(s.length);for(var i=0;i<s.length;i++)o[i]=s.charCodeAt(i);return o;}
  function call(method,path,body,raw,attempt){
    attempt=attempt||0;
    var headers={authorization:'Bearer '+auth()};
    if(body!==undefined&&!raw)headers['content-type']='application/json';
    if(raw)headers['content-type']='application/octet-stream';
    return fetch(API+path,{method:method,headers:headers,body:body===undefined?undefined:(raw?body:JSON.stringify(body)),credentials:'same-origin',cache:'no-store'}).then(function(r){
      if((r.status===429||r.status===503)&&attempt<6){var wait=Math.min(60,Number(r.headers.get('retry-after'))||10)*1000;status('요청 한도에 잠시 걸려 '+Math.round(wait/1000)+'초 후 이어서 올립니다…');return sleep(wait).then(function(){return call(method,path,body,raw,attempt+1);});}
      return r.json().catch(function(){return {};}).then(function(j){
        if(r.status===401){$('auth').hidden=false;}
        if(!r.ok||!j.ok){var e=new Error(j.error||('요청 실패 ('+r.status+')'));e.code=j.code;throw e;}
        return j;
      });
    },function(error){
      if(attempt<3)return sleep(2000*(attempt+1)).then(function(){return call(method,path,body,raw,attempt+1);});
      throw error;
    });
  }
  function status(text,kind){var el=$('status');el.textContent=text;el.className='ms-status'+(kind?' ms-'+kind:'');}
  function fmt(sec){if(!sec&&sec!==0)return '-';sec=Math.round(sec);var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0');}
  function text(tag,value){var el=document.createElement(tag);el.textContent=value;return el;}
  function loadList(){
    return call('GET','list').then(function(j){
      var box=$('list');box.textContent='';
      if(!j.items.length){box.textContent='아직 등록된 보호 영상이 없습니다.';return;}
      var table=document.createElement('table');
      var head=document.createElement('tr');['제목','상태','볼 수 있는 사람','길이','등록일',''].forEach(function(h){head.appendChild(text('th',h));});
      table.appendChild(head);
      j.items.forEach(function(item){
        var tr=document.createElement('tr');
        var titleCell=document.createElement('td');
        if(item.status==='published'){var a=document.createElement('a');a.href='/my/media/'+item.contentId;a.textContent=item.title;titleCell.appendChild(a);}else titleCell.textContent=item.title;
        tr.appendChild(titleCell);
        tr.appendChild(text('td',item.status==='published'?'공개됨':'업로드 미완료'));
        tr.appendChild(text('td',item.status!=='published'?'-':(item.audience==='members'?'로그인 회원 모두':'지정 '+item.subjects+'명')));
        tr.appendChild(text('td',fmt(item.duration)));
        tr.appendChild(text('td',item.publishedAt?item.publishedAt.slice(0,10):'-'));
        var actions=document.createElement('td');
        var del=document.createElement('button');del.type='button';del.className='ms-danger';del.textContent='삭제';
        del.addEventListener('click',function(){
          if(!confirm('"'+item.title+'" 영상을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?'))return;
          del.disabled=true;
          call('DELETE','content/'+item.contentId).then(loadList,function(e){del.disabled=false;alert(e.message);});
        });
        actions.appendChild(del);tr.appendChild(actions);
        table.appendChild(tr);
      });
      box.appendChild(table);
    },function(e){$('list').textContent=e.message;});
  }
  function contentKey(contentId){
    return crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']).then(function(pair){
      return crypto.subtle.exportKey('jwk',pair.publicKey).then(function(pub){return call('POST','key/'+contentId,{publicKey:{kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y}});}).then(function(res){
        var env=res.envelope;
        return crypto.subtle.importKey('jwk',Object.assign({},env.epk,{ext:true}),{name:'ECDH',namedCurve:'P-256'},false,[]).then(function(server){
          return crypto.subtle.deriveBits({name:'ECDH',public:server},pair.privateKey,256);
        }).then(function(shared){return crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);}).then(function(hkdf){
          return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:b64(env.salt),info:te.encode('ekodi-media-shield-wrap/v1')},hkdf,{name:'AES-GCM',length:256},false,['unwrapKey']);
        }).then(function(wrapping){
          return crypto.subtle.unwrapKey('raw',b64(env.wrapped),wrapping,{name:'AES-GCM',iv:b64(env.iv)},{name:'AES-GCM'},false,['encrypt']);
        });
      });
    });
  }
  function seal(key,contentId,name,bytes){
    var iv=crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({name:'AES-GCM',iv:iv,additionalData:te.encode('ekodi-media-shield:'+contentId+':'+name)},key,bytes).then(function(cipher){
      var out=new Uint8Array(12+cipher.byteLength);out.set(iv,0);out.set(new Uint8Array(cipher),12);return out;
    });
  }
  function upload(){
    var file=$('file').files[0];
    if(!file){alert('영상 파일을 골라 주세요.');return;}
    var title=$('title').value.trim()||file.name.replace(/\.[^.]+$/,'');
    var audience=document.querySelector('input[name=aud]:checked').value;
    var subjects=$('subjects').value;
    if(audience==='subjects'&&!subjects.trim()){alert('볼 수 있는 사람의 이메일을 입력해 주세요.');return;}
    busy=true;$('start').disabled=true;$('progress').hidden=false;$('bar').value=0;status('영상을 확인하고 있습니다…');
    var contentId='',key=null,queue=[],uploaded=0,expected=1,inflight=0,lastPut=0,failure=null;
    var mp4=window.EkodiMp4Box.createFile(false);
    var tracks=[],mime='',duration=0,times=[],pending=[],seen={},finished={},prev={},part=0,ready=false,readyError=null;
    function enqueue(name,bytes){queue.push({name:name,bytes:bytes});drain();}
    function drain(){
      while(inflight<2&&queue.length&&!failure){
        var job=queue.shift();inflight++;
        (function(job){
          var gap=Math.max(0,lastPut+700-Date.now());lastPut=Math.max(Date.now(),lastPut+700);
          sleep(gap).then(function(){return seal(key,contentId,job.name,job.bytes);}).then(function(sealed){
            if(sealed.byteLength>8*1024*1024)throw new Error('영상 조각 하나가 8MB를 넘습니다. 화질을 낮추거나 다시 인코딩해 주세요.');
            return call('PUT','part/'+contentId+'/'+job.name,sealed,true);
          }).then(function(){
            uploaded++;inflight--;
            $('bar').value=Math.min(99,Math.round(uploaded/Math.max(expected,uploaded)*100));
            status('암호화해서 올리는 중… '+uploaded+' / 약 '+Math.max(expected,uploaded)+' 조각');
            drain();
          },function(e){inflight--;failure=failure||e;});
        })(job);
      }
    }
    function flush(){
      if(!pending.length)return;
      var size=0;pending.forEach(function(p){size+=p.buffer.byteLength;});
      var out=new Uint8Array(size),o=0;pending.forEach(function(p){out.set(new Uint8Array(p.buffer),o);o+=p.buffer.byteLength;});
      times.push(Math.max(0,Math.min.apply(null,pending.map(function(p){return p.t;}))));
      part++;enqueue('s'+String(part).padStart(5,'0')+'.bin',out);
      pending=[];seen={};
    }
    mp4.onError=function(e){readyError=new Error('영상 파일을 읽을 수 없습니다: '+e);};
    mp4.onReady=function(info){
      tracks=info.tracks.filter(function(t){return t.type==='video'||t.type==='audio';});
      var video=tracks.filter(function(t){return t.type==='video';})[0];
      if(!video){readyError=new Error('영상 트랙이 없는 파일입니다.');return;}
      mime='video/mp4; codecs="'+tracks.map(function(t){return t.codec;}).join(', ')+'"';
      var MSX=window.MediaSource||window.ManagedMediaSource;
      // Viewers use many browsers: accept H.264 only (plays everywhere), even if this admin browser decodes HEVC.
      if(!/^avc[13]\./.test(video.codec)||(MSX&&!MSX.isTypeSupported(mime))){readyError=new Error('이 영상 형식('+video.codec+')은 브라우저에서 재생할 수 없습니다. 휴대폰 카메라 설정을 "호환성 우선(H.264)"으로 바꿔 촬영하거나 MP4(H.264)로 변환해 주세요.');return;}
      duration=(info.duration/info.timescale)||(video.duration/video.timescale);
      var seconds=Math.max(2,Math.min(10,6e6/Math.max(1,file.size/duration)));
      var n=Math.max(1,Math.round(seconds*video.nb_samples/(video.duration/video.timescale)));
      expected=Math.ceil(duration/seconds)+1;
      tracks.forEach(function(t){mp4.setSegmentOptions(t.id,null,{nbSamples:n});prev[t.id]=0;});
      enqueue('init.bin',new Uint8Array(mp4.initializeSegmentation().buffer));
      mp4.start();ready=true;
    };
    mp4.onSegment=function(id,user,buffer,sampleNumber,last){
      var trak=mp4.getTrackById(id),first=trak&&trak.samples&&trak.samples[prev[id]];
      pending.push({buffer:buffer,t:first?first.cts/first.timescale:0});
      prev[id]=sampleNumber;seen[id]=true;if(last)finished[id]=true;
      var all=tracks.every(function(t){return seen[t.id]||finished[t.id];});
      if(all)flush();
      mp4.releaseUsedSamples(id,sampleNumber);
    };
    var CHUNK=4*1024*1024,offset=0,reads=0;
    function readNext(){
      if(failure)return Promise.reject(failure);
      if(readyError)return Promise.reject(readyError);
      if(offset>=file.size||reads>200000)return Promise.resolve();
      if(queue.length>6)return sleep(150).then(readNext);
      var end=Math.min(offset+CHUNK,file.size);
      return file.slice(offset,end).arrayBuffer().then(function(ab){
        ab.fileStart=offset;reads++;
        var next=mp4.appendBuffer(ab);
        offset=(typeof next==='number'&&next!==offset)?next:end;
        return readNext();
      });
    }
    function waitDrain(){if(failure)return Promise.reject(failure);if(!queue.length&&!inflight)return Promise.resolve();return sleep(200).then(waitDrain);}
    call('POST','new',{}).then(function(j){contentId=j.contentId;return contentKey(contentId);}).then(function(k){key=k;status('영상을 나누고 암호화하는 중…');return readNext();}).then(function(){
      if(!ready)throw readyError||new Error('MP4 형식으로 읽을 수 없는 파일입니다.');
      mp4.flush();flush();
      return waitDrain();
    }).then(function(){
      status('공개 설정을 저장하고 있습니다…');
      return call('POST','publish/'+contentId,{title:title,mime:mime,times:times,duration:duration,audience:audience,subjects:subjects});
    }).then(function(j){
      $('bar').value=100;
      var el=$('status');el.className='ms-status ms-ok';el.textContent='완료되었습니다. 시청 주소: ';
      var a=document.createElement('a');a.href=j.watchPath;a.textContent=location.origin+j.watchPath;el.appendChild(a);
      $('file').value='';$('title').value='';
      loadList();
    }).catch(function(e){status((e&&e.message)||'업로드에 실패했습니다.','err');loadList();}).then(function(){busy=false;$('start').disabled=false;});
  }
  document.querySelectorAll('input[name=aud]').forEach(function(r){r.addEventListener('change',function(){$('subjects').hidden=document.querySelector('input[name=aud]:checked').value!=='subjects';});});
  $('file').addEventListener('change',function(){var f=$('file').files[0];if(f&&!$('title').value)$('title').value=f.name.replace(/\.[^.]+$/,'');});
  $('start').addEventListener('click',upload);
  window.addEventListener('beforeunload',function(e){if(busy){e.preventDefault();e.returnValue='';}});
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
  window.EkodiMediaShield.mount(video).then(function(){msg.className='ms-status';msg.textContent='재생 버튼을 눌러 시청하세요.';},show);
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
  if(path===ASSET.mp4box)return asset(MP4BOX_SOURCE,'text/javascript; charset=utf-8');
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
