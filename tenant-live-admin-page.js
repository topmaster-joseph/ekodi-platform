const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function tenantLiveAdminPage(tenant){
  const name=esc(tenant.name),tenantId=esc(tenant.apiTenant),authSite=esc(tenant.authSite),livePath=esc(tenant.path);
  const adminHome=esc(tenant.home.replace(/\/$/,'')+'/admin');
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><title>${name} 방송 · 녹화 관리</title><link rel="stylesheet" href="/tenant-live-admin.css"></head>
<body data-tenant="${tenantId}" data-auth-site="${authSite}" data-name="${name}" data-live-path="${livePath}" data-admin-home="${adminHome}">
<header class="top"><a class="brand" href="${adminHome}">${name}</a><nav><a href="${livePath}?mode=studio">라이브 스튜디오</a><a href="${adminHome}">사이트 관리자</a></nav></header>
<main>
<section class="hero"><div><p class="eyebrow">LIVE ADMIN</p><h1>방송 · 녹화 관리</h1><p>방송 기록과 녹화본을 한곳에서 재생·다운로드·공개·보존·게시합니다.</p></div><span id="authState">권한 확인 중</span></section>
<section class="cards"><article><span>전체 녹화</span><strong id="totalCount">-</strong></article><article><span>보관 완료</span><strong id="archivedCount">-</strong></article><article><span>공개</span><strong id="publicCount">-</strong></article><article><span>저장 용량</span><strong id="totalBytes">-</strong></article></section>
<section class="panel"><div class="toolbar"><div><strong>방송 기록</strong><small>기본값은 비공개입니다. 공개 전 직접 확인하세요.</small></div><button id="refreshButton" type="button">새로고침</button></div><div id="flash" class="flash"></div><div id="recordingList" class="list"><p class="empty">기록을 불러오고 있습니다.</p></div></section>
</main>
<dialog id="playerDialog"><form method="dialog"><button class="close" aria-label="닫기">×</button></form><h2 id="playerTitle">녹화 재생</h2><video id="player" controls playsinline></video></dialog>
<script src="/tenant-live-admin.js" defer></script></body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'}});
}

export function tenantLiveAdminCss(){
  return new Response(`:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#17211b;background:#f4f6f2}*{box-sizing:border-box}body{margin:0;background:#f4f6f2}.top{height:62px;display:flex;align-items:center;gap:20px;padding:0 24px;background:#fff;border-bottom:1px solid #dde4dc;position:sticky;top:0;z-index:5}.brand{font-weight:900;color:#173326;text-decoration:none}.top nav{margin-left:auto;display:flex;gap:8px}.top nav a,.toolbar button{padding:8px 11px;border:1px solid #d8e1da;border-radius:9px;background:#fff;color:#31483a;text-decoration:none;font-size:12px;cursor:pointer}main{width:min(1320px,calc(100% - 32px));margin:24px auto 54px}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.eyebrow{margin:0 0 7px;font-size:11px;letter-spacing:.16em;color:#6c7d73}.hero h1{margin:0;font-size:30px;letter-spacing:-.04em}.hero p:not(.eyebrow){margin:8px 0 0;color:#6f7b74}.hero>span{padding:7px 10px;border-radius:999px;background:#fff;border:1px solid #dbe2dc;font-size:12px}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:20px 0}.cards article,.panel{background:#fff;border:1px solid #dfe5df;border-radius:14px}.cards article{padding:15px}.cards span{display:block;color:#7b877f;font-size:11px}.cards strong{display:block;margin-top:5px;font-size:22px}.panel{padding:16px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:14px;padding-bottom:12px;border-bottom:1px solid #edf0ed}.toolbar strong{display:block}.toolbar small{display:block;color:#859088;margin-top:3px}.flash{min-height:24px;padding:8px 0;color:#8a5a24;font-size:12px}.list{display:grid;gap:10px}.record{display:grid;grid-template-columns:minmax(220px,1.3fr) minmax(120px,.7fr) minmax(160px,.8fr) minmax(360px,1.4fr);gap:12px;align-items:center;padding:13px;border:1px solid #e6ebe6;border-radius:12px;background:#fbfcfb}.record h3{margin:0 0 5px;font-size:14px}.record p,.record small{margin:0;color:#7a867e;font-size:11px}.badges{display:flex;gap:5px;flex-wrap:wrap}.badge{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eef3ef;color:#53665a;font-size:10px}.badge.ready{background:#e9f5ed;color:#276842}.badge.warn{background:#fff3e5;color:#955a16}.actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.actions button,.actions select{min-height:34px;border:1px solid #dbe2dc;border-radius:8px;background:#fff;color:#34493c;padding:6px 9px;font:inherit;font-size:11px}.actions button{cursor:pointer}.actions .primary{background:#315d48;color:#fff;border-color:#315d48}.actions .danger{color:#934545}.empty{color:#89938d;font-size:13px;padding:24px 6px}.size{font-variant-numeric:tabular-nums}dialog{width:min(1000px,94vw);border:0;border-radius:16px;padding:18px;background:#111;box-shadow:0 25px 90px #0008}dialog::backdrop{background:#0008}dialog h2{color:#fff;font-size:15px;margin:0 42px 12px 0}.close{position:absolute;right:14px;top:12px;border:0;background:#ffffff1e;color:#fff;border-radius:50%;width:32px;height:32px;font-size:21px;cursor:pointer}#player{width:100%;max-height:72vh;background:#000}.flash.ok{color:#2f6d48}.flash.error{color:#a33a3a}@media(max-width:900px){.cards{grid-template-columns:repeat(2,1fr)}.record{grid-template-columns:1fr}.actions{justify-content:flex-start}.top{padding:0 14px}.top nav a:first-child{display:none}}@media(max-width:560px){main{width:min(100% - 18px,1320px)}.cards{grid-template-columns:1fr 1fr}.hero{display:block}.hero>span{display:inline-flex;margin-top:12px}}`,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}

function client(){
  const body=document.body,cfg=body.dataset,$=id=>document.getElementById(id);
  const API='/api/realtime',SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co',SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  let objectUrl='';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtBytes=n=>{const v=Number(n||0);if(!v)return'0 B';const u=['B','KB','MB','GB','TB'];const i=Math.min(u.length-1,Math.floor(Math.log(v)/Math.log(1024)));return `${(v/1024**i).toFixed(i?1:0)} ${u[i]}`};
  function storedSupabase(){try{const raw=localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token');if(!raw)return null;const d=JSON.parse(raw);return d?.access_token?d:null}catch{return null}}
  function token(){return sessionStorage.getItem('ekodi-auth-token')||storedSupabase()?.access_token||''}
  function login(){const u=new URL('/auth/',location.origin);u.searchParams.set('site',cfg.authSite||cfg.tenant);u.searchParams.set('return_to',location.href.split('#')[0]);location.assign(u)}
  async function bootstrap(){
    const hash=new URLSearchParams(location.hash.slice(1)),handoff=hash.get('ekodi_token');
    if(handoff){history.replaceState(null,'',location.pathname+location.search);try{const r=await fetch(SUPABASE_URL+'/auth/v1/verify',{method:'POST',headers:{apikey:SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify({token_hash:handoff,type:hash.get('ekodi_type')||'email'})});const d=await r.json().catch(()=>({}));if(r.ok&&(d.access_token||d.session?.access_token)){sessionStorage.setItem('ekodi-auth-token',d.access_token||d.session.access_token);return true}}catch{}}
    return Boolean(token());
  }
  async function api(path,options={}){const headers=new Headers(options.headers||{});if(token())headers.set('authorization','Bearer '+token());if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');const r=await fetch(API+path,{...options,headers,cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||`HTTP ${r.status}`),{status:r.status,data:d});return d}
  function flash(msg,type=''){const el=$('flash');el.textContent=msg||'';el.className='flash '+type}
  function badge(text,kind=''){return `<span class="badge ${kind}">${esc(text)}</span>`}
  function statusLabel(r){return r.status==='ready'?'저장 완료':r.status==='recording'?'녹화 중':r.status==='failed'?'녹화 실패':r.status}
  function archiveLabel(r){return r.archiveStatus==='archived'?'공유드라이브 보관':r.archiveStatus==='pending'?'공유드라이브 대기':r.archiveStatus||'-'}
  function render(rows){
    const active=rows.filter(r=>r.status!=='deleted');
    $('totalCount').textContent=String(active.length);$('archivedCount').textContent=String(active.filter(r=>r.archiveStatus==='archived').length);$('publicCount').textContent=String(active.filter(r=>r.visibility==='public').length);$('totalBytes').textContent=fmtBytes(active.reduce((s,r)=>s+Number(r.byteSize||0),0));
    if(!active.length){$('recordingList').innerHTML='<p class="empty">아직 저장된 방송 녹화가 없습니다.</p>';return}
    $('recordingList').innerHTML=active.map(r=>`<article class="record" data-id="${esc(r.id)}"><div><h3>${esc(r.title||'방송 녹화')}</h3><p>${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</p><small>${esc(r.id)}</small></div><div class="badges">${badge(statusLabel(r),r.status==='ready'?'ready':'warn')}${badge(archiveLabel(r),r.archiveStatus==='archived'?'ready':'warn')}${badge(r.visibility==='public'?'공개':'비공개')}</div><div><strong class="size">${fmtBytes(r.byteSize)}</strong><p>보존 ${r.retentionUntil?esc(new Date(r.retentionUntil).toLocaleDateString('ko-KR')):'영구'}</p><p>YouTube ${esc(r.youtubeStatus||'not_requested')}</p></div><div class="actions"><button data-action="play">재생</button><button data-action="download">다운로드</button><button data-action="visibility">${r.visibility==='public'?'비공개로':'공개로'}</button><select data-action="retention" aria-label="보존기간"><option value="">보존기간</option><option value="30">30일</option><option value="90">90일</option><option value="180">180일</option><option value="365">1년</option><option value="0">영구</option></select><button data-action="youtube">YouTube 게시</button><button class="danger" data-action="delete">삭제</button></div></article>`).join('');
    for(const node of document.querySelectorAll('.record')){
      const id=node.dataset.id,r=active.find(x=>x.id===id);if(!r)continue;
      node.addEventListener('click',async e=>{const action=e.target?.dataset?.action;if(!action||action==='retention')return;try{
        if(action==='play')return play(r);
        if(action==='download')return download(r);
        if(action==='visibility'){await api('/recordings/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({visibility:r.visibility==='public'?'private':'public'})});flash('공개 상태를 변경했습니다.','ok');return load()}
        if(action==='youtube'){try{await api('/recordings/'+encodeURIComponent(id)+'/youtube',{method:'POST',body:'{}'});flash('YouTube 게시 요청을 보냈습니다.','ok')}catch(err){if(err.data?.connectUrl){flash('YouTube 채널 연결이 필요합니다. 연결 화면을 엽니다.','error');window.open(err.data.connectUrl,'_blank','noopener');return}throw err}return load()}
        if(action==='delete'){if(!confirm('이 녹화본을 삭제하시겠습니까? R2와 공유드라이브 보관본도 삭제됩니다.'))return;await api('/recordings/'+encodeURIComponent(id),{method:'DELETE'});flash('녹화본을 삭제했습니다.','ok');return load()}
      }catch(err){flash('처리 실패: '+err.message,'error')}});
      const select=node.querySelector('select[data-action="retention"]');select?.addEventListener('change',async()=>{if(select.value==='')return;try{await api('/recordings/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({retentionDays:Number(select.value)})});flash('보존기간을 변경했습니다.','ok');load()}catch(err){flash('보존기간 변경 실패: '+err.message,'error')}});
    }
  }
  async function mediaBlob(r){const response=await fetch(API+'/recordings/'+encodeURIComponent(r.id)+'/media',{headers:{authorization:'Bearer '+token()},cache:'no-store'});if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d.error||'media_'+response.status)}return response.blob()}
  async function play(r){flash('녹화본을 불러오고 있습니다.');const blob=await mediaBlob(r);if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);$('player').src=objectUrl;$('playerTitle').textContent=r.title||'녹화 재생';$('playerDialog').showModal();flash('')}
  async function download(r){flash('다운로드를 준비하고 있습니다.');const blob=await mediaBlob(r);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(r.title||'recording').replace(/[\\/:*?"<>|]/g,'_')+(r.mimeType?.includes('mp4')?'.mp4':'.webm');a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);flash('다운로드를 시작했습니다.','ok')}
  async function load(){try{const d=await api('/recordings?tenant='+encodeURIComponent(cfg.tenant));$('authState').textContent='관리 권한 확인';render(d.recordings||[])}catch(err){if(err.status===401){$('authState').textContent='로그인 필요';return login()}$('authState').textContent='권한 확인 필요';$('recordingList').innerHTML='<p class="empty">방송 · 녹화 관리 권한을 확인할 수 없습니다. '+esc(err.message)+'</p>';flash(err.message,'error')}}
  $('refreshButton').addEventListener('click',load);$('playerDialog').addEventListener('close',()=>{try{$('player').pause();$('player').removeAttribute('src');$('player').load();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=''}catch{}});
  bootstrap().then(ok=>ok?load():login());
}

export function tenantLiveAdminScript(){
  return new Response(`(${client.toString()})();`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
