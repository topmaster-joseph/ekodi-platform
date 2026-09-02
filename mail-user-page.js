const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.readonly';
export const MAIL_HOST='mail.ekodi.kr';

const tokenCache=new Map();
const encoder=new TextEncoder();

function secureHeaders(contentType='application/json; charset=utf-8'){
  return {
    'content-type':contentType,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
  };
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:secureHeaders()})}
function base64Url(bytes){
  const bin=typeof bytes==='string'?bytes:String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeBase64Url(value=''){
  const normalized=String(value).replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  try{return decodeURIComponent(Array.from(atob(padded),c=>`%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join(''))}
  catch{return ''}
}
function pemBytes(value){
  const body=String(value||'').replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');
  if(!body)throw new Error('MAIL_SERVICE_ACCOUNT_NOT_CONFIGURED');
  return Uint8Array.from(atob(body),c=>c.charCodeAt(0));
}
function allowedDomains(env){
  return new Set(String(env.MAIL_ALLOWED_DOMAINS||'ekodibiz.kr,ekodi.kr').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean));
}
function accountMap(env){
  try{const parsed=JSON.parse(String(env.MAIL_ACCOUNT_MAP||'{}'));return parsed&&typeof parsed==='object'?parsed:{}}
  catch{return {}}
}
async function verifiedIdentity(request,env){
  const auth=String(request.headers.get('authorization')||'');
  if(!auth.startsWith('Bearer '))return null;
  const key=String(env.SUPABASE_PUBLISHABLE_KEY||DEFAULT_PUBLISHABLE_KEY);
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:key,authorization:auth},cache:'no-store'});
  if(!response.ok)return null;
  const user=await response.json();
  return user?.email?{id:user.id,email:String(user.email).toLowerCase()}:null;
}
function mailboxFor(identity,env){
  const map=accountMap(env);
  const mapped=String(map[identity.email]||identity.email).trim().toLowerCase();
  const at=mapped.lastIndexOf('@');
  const domain=at>=0?mapped.slice(at+1):'';
  if(!allowedDomains(env).has(domain))return null;
  return mapped;
}
async function serviceAccountToken(mailbox,env){
  const cached=tokenCache.get(mailbox);
  if(cached&&cached.expiresAt>Date.now()+60000)return cached.token;
  const serviceEmail=String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL||'').trim();
  if(!serviceEmail||!env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)throw new Error('MAIL_SERVICE_ACCOUNT_NOT_CONFIGURED');
  const now=Math.floor(Date.now()/1000);
  const header=base64Url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claims=base64Url(JSON.stringify({iss:serviceEmail,sub:mailbox,scope:GMAIL_SCOPE,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const input=`${header}.${claims}`;
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(input));
  const assertion=`${input}.${base64Url(signature)}`;
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const data=await response.json();
  if(!response.ok||!data.access_token){
    const error=new Error(data.error_description||data.error||'GOOGLE_TOKEN_EXCHANGE_FAILED');
    error.code='GOOGLE_TOKEN_EXCHANGE_FAILED';throw error;
  }
  tokenCache.set(mailbox,{token:data.access_token,expiresAt:Date.now()+Math.max(60,Number(data.expires_in||3600)-120)*1000});
  return data.access_token;
}
async function gmailFetch(mailbox,env,path){
  const token=await serviceAccountToken(mailbox,env);
  const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data?.error?.message||`GMAIL_${response.status}`);error.status=response.status;throw error}
  return data;
}
function headerValue(message,name){
  const headers=message?.payload?.headers||[];
  return String(headers.find(h=>String(h.name).toLowerCase()===name.toLowerCase())?.value||'');
}
function summarize(message){return {id:message.id,threadId:message.threadId,from:headerValue(message,'From'),subject:headerValue(message,'Subject')||'(제목 없음)',date:headerValue(message,'Date'),snippet:String(message.snippet||''),unread:Array.isArray(message.labelIds)&&message.labelIds.includes('UNREAD')}}
function flattenParts(part,out=[]){if(!part)return out;out.push(part);for(const child of part.parts||[])flattenParts(child,out);return out}
function messageBody(message){
  const parts=flattenParts(message?.payload);
  const plain=parts.find(p=>p.mimeType==='text/plain'&&p.body?.data);
  if(plain)return decodeBase64Url(plain.body.data).slice(0,200000);
  const html=parts.find(p=>p.mimeType==='text/html'&&p.body?.data);
  if(html)return decodeBase64Url(html.body.data).replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s{3,}/g,'\n\n').trim().slice(0,200000);
  return decodeBase64Url(message?.payload?.body?.data||'').slice(0,200000);
}
function attachments(message){return flattenParts(message?.payload).filter(p=>p.filename&&p.body?.attachmentId).map(p=>({filename:p.filename,mimeType:p.mimeType||'application/octet-stream',size:Number(p.body?.size||0)}))}
function apiError(error){
  console.error('EKODI Mail API',error);
  const code=String(error?.code||error?.message||'MAIL_API_ERROR');
  if(code==='MAIL_SERVICE_ACCOUNT_NOT_CONFIGURED')return json({error:'EKODI Mail의 Google Workspace 연결 설정이 아직 완료되지 않았습니다.',code},503);
  if(code==='GOOGLE_TOKEN_EXCHANGE_FAILED')return json({error:'Google Workspace 위임 권한을 확인해 주세요.',code},503);
  return json({error:'메일을 불러오지 못했습니다.',code:'MAIL_API_ERROR'},Number(error?.status)>=400&&Number(error?.status)<600?Number(error.status):502);
}
export async function handleMailApi(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/mail/'))return null;
  if(request.method!=='GET')return json({error:'읽기 전용 서비스입니다.',code:'READ_ONLY'},405);
  const identity=await verifiedIdentity(request,env);
  if(!identity)return json({error:'로그인이 필요합니다.',code:'AUTH_REQUIRED'},401);
  const mailbox=mailboxFor(identity,env);
  if(!mailbox)return json({error:'이 계정에 연결된 EKODI Workspace 메일이 없습니다.',code:'MAILBOX_NOT_MAPPED'},403);
  try{
    if(url.pathname==='/api/mail/status'){
      const configured=Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
      return json({ok:true,configured,mailbox,mode:'read-only'});
    }
    if(url.pathname==='/api/mail/messages'){
      const q=String(url.searchParams.get('q')||'').trim().slice(0,200);
      const pageToken=String(url.searchParams.get('pageToken')||'').trim().slice(0,512);
      const params=new URLSearchParams({maxResults:'30',labelIds:'INBOX'});if(q)params.set('q',q);if(pageToken)params.set('pageToken',pageToken);
      const list=await gmailFetch(mailbox,env,`/messages?${params}`);
      const details=await Promise.all((list.messages||[]).map(item=>gmailFetch(mailbox,env,`/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`).then(summarize)));
      return json({mailbox,messages:details,nextPageToken:list.nextPageToken||null,resultSizeEstimate:Number(list.resultSizeEstimate||0)});
    }
    const match=url.pathname.match(/^\/api\/mail\/messages\/([A-Za-z0-9_-]+)$/);
    if(match){
      const message=await gmailFetch(mailbox,env,`/messages/${encodeURIComponent(match[1])}?format=full`);
      return json({mailbox,message:{...summarize(message),to:headerValue(message,'To'),cc:headerValue(message,'Cc'),body:messageBody(message),attachments:attachments(message)}});
    }
    return json({error:'찾을 수 없습니다.',code:'NOT_FOUND'},404);
  }catch(error){return apiError(error)}
}

export function mailUserPage(){
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>EKODI Mail</title><style>
  :root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh}.top{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.97);border-bottom:1px solid #e5e9f0;padding:14px 20px}.head{max-width:1180px;margin:auto;display:flex;align-items:center;gap:12px}.head h1{font-size:20px;margin:0}.head p{font-size:12px;color:#6b7280;margin:3px 0 0}.head a{margin-left:auto;text-decoration:none;color:#334155;border:1px solid #d8dee8;padding:8px 10px;border-radius:10px;font-size:12px}.tabs{max-width:1180px;margin:0 auto;padding:12px 20px 0;display:flex;gap:7px;overflow:auto}.tab{white-space:nowrap;border:1px solid #d8dee8;background:#fff;border-radius:999px;padding:8px 11px;font-size:12px;cursor:pointer}.tab.active{background:#1f3c88;color:#fff;border-color:#1f3c88}.app{max-width:1180px;margin:0 auto;padding:12px 20px 24px;display:grid;grid-template-columns:390px 1fr;gap:12px}.panel{background:#fff;border:1px solid #e5e9f0;border-radius:16px;overflow:hidden;min-height:68vh}.toolbar{padding:12px;border-bottom:1px solid #eef1f5;display:flex;gap:7px}.toolbar input{width:100%;border:1px solid #d8dee8;border-radius:10px;padding:10px 11px}.toolbar button,.action{border:1px solid #d8dee8;background:#fff;border-radius:10px;padding:9px 10px;cursor:pointer}.status{padding:10px 14px;font-size:11px;color:#667085;border-bottom:1px solid #eef1f5}.mail{width:100%;text-align:left;border:0;border-bottom:1px solid #eef1f5;background:#fff;padding:13px 15px;cursor:pointer}.mail:hover{background:#f8fafc}.mail.unread{background:#f4f7ff}.mail strong,.mail span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mail .from{font-size:12px}.mail .subject{font-size:14px;margin:4px 0}.mail .snippet,.origin{font-size:11px;color:#7b8495}.detail{padding:26px}.detail h2{font-size:20px;margin:0 0 12px}.meta{white-space:pre-wrap;font-size:12px;color:#667085;line-height:1.7;border-bottom:1px solid #eef1f5;padding-bottom:14px}.body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;font-size:14px;padding-top:18px}.empty{padding:38px 20px;text-align:center;color:#6b7280;font-size:13px;line-height:1.7}.pager{display:flex;justify-content:flex-end;padding:10px}.hide{display:none!important}.compose{border-top:1px solid #eef1f5;padding:14px;display:grid;gap:8px}.compose input,.compose textarea{border:1px solid #d8dee8;border-radius:9px;padding:9px;font:inherit}.compose textarea{min-height:100px;resize:vertical}.aliases{font-size:11px;color:#6b7280;margin-top:5px}@media(max-width:760px){.app{grid-template-columns:1fr;padding:10px}.tabs{padding:10px}.panel{min-height:auto}.detail-panel{min-height:52vh}.head{align-items:flex-start}.head p{display:none}}
  </style></head><body><header class="top"><div class="head"><div><h1>EKODI Mail</h1><p id="accountLabel">권한 있는 메일 계정을 불러오는 중입니다.</p></div><a href="/admin">메일 관리</a></div></header><nav class="tabs" id="tabs"></nav><main class="app"><section class="panel"><form class="toolbar" id="searchForm"><input id="search" type="search" placeholder="현재 범위에서 메일 검색" autocomplete="off"><button type="submit">검색</button></form><div class="status" id="status">인증 확인 중…</div><div id="list"></div><div class="pager"><button class="action hide" id="next">다음</button></div></section><section class="panel detail-panel"><div class="empty" id="empty">왼쪽에서 메일을 선택하세요.</div><article class="detail hide" id="detail"><h2 id="subject"></h2><div class="meta" id="meta"></div><div class="body" id="body"></div><div id="files"></div><p><a class="action" id="providerLink" target="_blank" rel="noopener">원본 메일 열기</a></p></article><form class="compose hide" id="compose"><strong>메일 쓰기</strong><input id="to" type="text" placeholder="받는 사람"><input id="composeSubject" type="text" placeholder="제목"><textarea id="composeBody" placeholder="내용"></textarea><button class="action" type="submit">보내기</button><span class="origin" id="composeOrigin"></span></form></section></main><script type="module">  import{createClient}from'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const SB='${SUPABASE_URL}',KEY='${DEFAULT_PUBLISHABLE_KEY}',CONTROL='https://api.ekodi.kr/api/mail/control',sb=createClient(SB,KEY,{auth:{persistSession:true,detectSessionInUrl:false}}),$=id=>document.getElementById(id);
  let token='',model=null,readable=[],current='all',nextToken=null,currentStatus=null;
  async function api(path,init={}){const r=await fetch(CONTROL+path,{...init,headers:{authorization:'Bearer '+token,'content-type':'application/json',...(init.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(r.status===401){location.replace('https://auth.ekodi.kr/?site=mail&return_to='+encodeURIComponent(location.href));throw new Error('login_required')}if(!r.ok)throw Object.assign(new Error(d.error||'메일 요청 실패'),{code:d.code,status:r.status});return d}
  function tabLabel(a){return(a.ownerLabel||'개인')+' · '+(a.displayName||a.emailAddress)}
  function renderTabs(){const box=$('tabs');const all=document.createElement('button');all.className='tab'+(current==='all'?' active':'');all.textContent='전체';all.onclick=()=>select('all');const items=readable.map(a=>{const b=document.createElement('button');b.className='tab'+(current===String(a.id)?' active':'');b.textContent=tabLabel(a);b.onclick=()=>select(String(a.id));return b});box.replaceChildren(all,...items)}
  async function select(id){current=id;nextToken=null;renderTabs();$('detail').classList.add('hide');$('empty').classList.remove('hide');$('empty').textContent='왼쪽에서 메일을 선택하세요.';$('compose').classList.add('hide');await load($('search').value.trim())}
  function row(m){const b=document.createElement('button');b.className='mail'+(m.unread?' unread':'');b.type='button';const f=document.createElement('strong');f.className='from';f.textContent=m.from||'보낸 사람 없음';const s=document.createElement('span');s.className='subject';s.textContent=m.subject||'(제목 없음)';const n=document.createElement('span');n.className='snippet';n.textContent=m.snippet||'';const o=document.createElement('span');o.className='origin';o.textContent=m.accountLabel||'';b.append(f,s,n,o);b.onclick=()=>openMail(m.accountId,m.id,m.threadId);return b}
  async function accountStatus(a){try{return await api('/accounts/'+a.id+'/status')}catch{return null}}
  async function loadAll(q){const results=await Promise.all(readable.map(async a=>{try{const u=new URL(CONTROL+'/accounts/'+a.id+'/messages');u.searchParams.set('maxResults','15');if(q)u.searchParams.set('q',q);const d=await api(u.pathname.replace('/api/mail/control','')+u.search);return(d.messages||[]).map(m=>({...m,accountId:a.id,accountEmail:a.emailAddress,accountLabel:tabLabel(a)}))}catch{return[]} }));const merged=results.flat().sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));$('accountLabel').textContent='전체 받은편지함 · '+readable.length+'개 연결 계정';$('status').textContent=merged.length+'개의 최근 메일';$('list').replaceChildren(...(merged.length?merged.map(row):[Object.assign(document.createElement('div'),{className:'empty',textContent:'표시할 메일이 없습니다.'})]));$('next').classList.add('hide')}
  async function loadOne(a,q,page=''){const u=new URL(CONTROL+'/accounts/'+a.id+'/messages');if(q)u.searchParams.set('q',q);if(page)u.searchParams.set('pageToken',page);const d=await api(u.pathname.replace('/api/mail/control','')+u.search);currentStatus=await accountStatus(a);const aliases=currentStatus?.account?.aliases?.map(x=>x.address)||[];$('accountLabel').textContent=tabLabel(a)+(aliases.length?' · 연결 주소 '+aliases.join(', '):'');$('status').textContent=d.messages.length+'개의 메일';$('list').replaceChildren(...(d.messages.length?d.messages.map(m=>row({...m,accountId:a.id,accountEmail:a.emailAddress,accountLabel:tabLabel(a)})):[Object.assign(document.createElement('div'),{className:'empty',textContent:'표시할 메일이 없습니다.'})]));nextToken=d.nextPageToken;$('next').classList.toggle('hide',!nextToken);if(a.permissions?.send){$('compose').classList.remove('hide');$('composeOrigin').textContent='보내는 계정: '+a.emailAddress+(currentStatus?.connector?.sendScope?'':' · 공급자 발송 권한 승인 필요 가능')}else $('compose').classList.add('hide')}
  async function load(q,page=''){try{$('status').textContent='메일을 불러오는 중…';if(!readable.length){$('accountLabel').textContent='연결된 읽기 가능 메일 계정이 없습니다.';$('status').textContent='메일 관리에서 계정을 연결하세요.';$('list').innerHTML='<div class="empty">메일 관리에서 계정을 등록하고 읽기 권한을 연결하면 여기에 계정별 탭이 나타납니다.</div>';return}if(current==='all')return loadAll(q);const a=readable.find(x=>String(x.id)===current);if(!a){current='all';renderTabs();return loadAll(q)}return loadOne(a,q,page)}catch(e){$('status').textContent=e.message;$('list').innerHTML='<div class="empty">'+e.message+'</div>'}}  async function openMail(accountId,id,threadId){try{$('empty').textContent='메일을 여는 중…';const d=await api('/accounts/'+accountId+'/messages/'+encodeURIComponent(id));const m=d.message,a=readable.find(x=>Number(x.id)===Number(accountId));$('subject').textContent=m.subject;$('meta').textContent=[a?'계정: '+a.emailAddress:'',m.from?'보낸 사람: '+m.from:'',m.to?'받는 사람: '+m.to:'',m.cc?'참조: '+m.cc:'',m.date].filter(Boolean).join('\n');$('body').textContent=m.body||'(본문 없음)';$('files').textContent=m.attachments?.length?'첨부: '+m.attachments.map(x=>x.filename).join(', '):'';const link=$('providerLink');if(a?.provider==='gmail'){link.href='https://mail.google.com/mail/?authuser='+encodeURIComponent(a.emailAddress)+'#inbox/'+encodeURIComponent(m.threadId||threadId);link.classList.remove('hide')}else link.classList.add('hide');$('empty').classList.add('hide');$('detail').classList.remove('hide')}catch(e){$('empty').textContent=e.message;$('empty').classList.remove('hide');$('detail').classList.add('hide')}}
  async function boot(){const h=new URLSearchParams(location.hash.slice(1)),handoff=h.get('ekodi_token');if(handoff){try{await sb.auth.verifyOtp({token_hash:handoff,type:h.get('ekodi_type')||'email'})}catch{}history.replaceState({},document.title,location.pathname+location.search)}const {data}=await sb.auth.getSession();if(!data.session){location.replace('https://auth.ekodi.kr/?site=mail&return_to='+encodeURIComponent(location.href));return}token=data.session.access_token;try{model=await api('/contexts');readable=(model.accounts||[]).filter(a=>a.enabled&&a.connectionStatus==='connected'&&a.permissions?.read);const requested=new URLSearchParams(location.search).get('account');if(requested&&readable.some(a=>String(a.id)===requested))current=requested;renderTabs();await load('')}catch(e){$('status').textContent=e.message;$('list').innerHTML='<div class="empty">'+e.message+'</div>'}}
  $('searchForm').addEventListener('submit',e=>{e.preventDefault();nextToken=null;load($('search').value.trim())});$('next').onclick=()=>{if(current!=='all'&&nextToken)load($('search').value.trim(),nextToken)};
  $('compose').addEventListener('submit',async e=>{e.preventDefault();const a=readable.find(x=>String(x.id)===current);if(!a){alert('보낼 메일 계정을 먼저 선택해 주세요.');return}try{$('status').textContent='메일 발송 중…';await api('/accounts/'+a.id+'/send',{method:'POST',body:JSON.stringify({to:$('to').value.trim(),subject:$('composeSubject').value,body:$('composeBody').value})});$('to').value='';$('composeSubject').value='';$('composeBody').value='';$('status').textContent='메일을 보냈습니다.'}catch(err){$('status').textContent=err.message;if(err.code==='MAIL_SEND_SCOPE_REQUIRED')alert('메일 관리에서 이 계정의 Gmail 발송 권한을 추가로 승인해 주세요.');else alert(err.message)}});
  boot();
  </script></body></html>`;
  const headers=secureHeaders('text/html; charset=utf-8');headers['content-security-policy']="default-src 'self'; style-src 'self' 'unsafe-inline' https://shell.ekodi.kr; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://shell.ekodi.kr; connect-src 'self' https://api.ekodi.kr https://renzehysxirjilvdxacv.supabase.co https://cdn.jsdelivr.net https://shell.ekodi.kr; img-src 'self' data: https://lh3.googleusercontent.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";headers['x-ekodi-route']='mail-hub';return new Response(html,{headers});
}
