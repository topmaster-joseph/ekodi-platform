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
  :root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh}.top{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.96);border-bottom:1px solid #e5e9f0;padding:18px 20px;text-align:center}.top h1{font-size:20px;margin:0}.top p{font-size:12px;color:#6b7280;margin:5px 0 0}.app{max-width:1080px;margin:0 auto;padding:22px;display:grid;grid-template-columns:390px 1fr;gap:16px}.panel{background:#fff;border:1px solid #e5e9f0;border-radius:18px;overflow:hidden;min-height:70vh}.toolbar{padding:14px;border-bottom:1px solid #eef1f5;display:flex;gap:8px}.toolbar input{width:100%;border:1px solid #d8dee8;border-radius:12px;padding:11px 12px;font-size:14px}.toolbar button,.action{border:1px solid #d8dee8;background:#fff;border-radius:12px;padding:10px 12px;cursor:pointer}.status{padding:13px 15px;font-size:12px;color:#667085;border-bottom:1px solid #eef1f5}.mail{width:100%;text-align:left;border:0;border-bottom:1px solid #eef1f5;background:#fff;padding:14px 16px;cursor:pointer}.mail:hover{background:#f8fafc}.mail.unread{background:#f4f7ff}.mail strong,.mail span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mail .from{font-size:13px}.mail .subject{font-size:14px;margin:4px 0}.mail .snippet{font-size:12px;color:#7b8495}.detail{padding:28px}.detail h2{font-size:21px;margin:0 0 12px}.meta{font-size:12px;color:#667085;line-height:1.7;border-bottom:1px solid #eef1f5;padding-bottom:16px}.body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;font-size:14px;padding-top:18px}.empty{padding:42px 24px;text-align:center;color:#6b7280}.pager{display:flex;justify-content:flex-end;gap:8px;padding:12px}.hide{display:none!important}@media(max-width:760px){.app{grid-template-columns:1fr;padding:10px}.panel{min-height:auto}.detail-panel{min-height:55vh}.top{padding:14px}.app{gap:10px}}
  </style></head><body><header class="top"><h1>EKODI Mail</h1><p id="accountLabel">내 메일을 안전하게 불러오는 중입니다.</p></header><main class="app"><section class="panel"><form class="toolbar" id="searchForm"><input id="search" type="search" placeholder="메일 검색" autocomplete="off"><button type="submit">검색</button></form><div class="status" id="status">인증 확인 중…</div><div id="list"></div><div class="pager"><button class="action hide" id="next">다음</button></div></section><section class="panel detail-panel"><div class="empty" id="empty">왼쪽에서 메일을 선택하세요.</div><article class="detail hide" id="detail"><h2 id="subject"></h2><div class="meta" id="meta"></div><div class="body" id="body"></div><div id="files"></div><p><a class="action" id="gmailLink" target="_blank" rel="noopener">Gmail 원본 열기</a></p></article></section></main><script type="module">
  import{createClient}from'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const SB='${SUPABASE_URL}',KEY='${DEFAULT_PUBLISHABLE_KEY}',sb=createClient(SB,KEY,{auth:{persistSession:true,detectSessionInUrl:false}});let nextToken=null;
  const $=id=>document.getElementById(id);const esc=s=>String(s??'');
  async function bootstrap(){
    const hp=new URLSearchParams(location.hash.slice(1)),handoff=hp.get('ekodi_token');
    if(handoff){try{await sb.auth.verifyOtp({token_hash:handoff,type:hp.get('ekodi_type')||'email'})}catch{}history.replaceState({},document.title,location.pathname+location.search)}
    const {data}=await sb.auth.getSession();if(!data.session){location.replace('https://auth.ekodi.kr/?site=mail&return_to='+encodeURIComponent(location.origin+'/'));return}
    window.__mailToken=data.session.access_token;await load('');
  }
  async function api(path){const r=await fetch(path,{headers:{authorization:'Bearer '+window.__mailToken},cache:'no-store'});const d=await r.json().catch(()=>({}));if(r.status===401){location.replace('https://auth.ekodi.kr/?site=mail&return_to='+encodeURIComponent(location.origin+'/'));throw new Error('login_required')}if(!r.ok)throw Object.assign(new Error(d.error||'메일 요청 실패'),{data:d});return d}
  function row(m){const b=document.createElement('button');b.className='mail'+(m.unread?' unread':'');b.type='button';const f=document.createElement('strong');f.className='from';f.textContent=m.from||'보낸 사람 없음';const s=document.createElement('span');s.className='subject';s.textContent=m.subject;const n=document.createElement('span');n.className='snippet';n.textContent=m.snippet;b.append(f,s,n);b.onclick=()=>openMail(m.id,m.threadId);return b}
  async function load(q,page=''){try{$('status').textContent='메일을 불러오는 중…';const u=new URL('/api/mail/messages',location.origin);if(q)u.searchParams.set('q',q);if(page)u.searchParams.set('pageToken',page);const d=await api(u);$('accountLabel').textContent=d.mailbox+' · 읽기 전용';$('status').textContent=d.messages.length+'개의 메일';$('list').replaceChildren(...d.messages.map(row));nextToken=d.nextPageToken;$('next').classList.toggle('hide',!nextToken)}catch(e){$('status').textContent=e.message;$('list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
  async function openMail(id,threadId){try{$('empty').textContent='메일을 여는 중…';const d=await api('/api/mail/messages/'+encodeURIComponent(id));const m=d.message;$('subject').textContent=m.subject;$('meta').textContent=[m.from?'보낸 사람: '+m.from:'',m.to?'받는 사람: '+m.to:'',m.cc?'참조: '+m.cc:'',m.date].filter(Boolean).join('\n');$('body').textContent=m.body||'(본문 없음)';$('files').textContent=m.attachments?.length?'첨부: '+m.attachments.map(a=>a.filename).join(', '):'';$('gmailLink').href='https://mail.google.com/mail/u/0/#inbox/'+encodeURIComponent(m.threadId||threadId);$('empty').classList.add('hide');$('detail').classList.remove('hide')}catch(e){$('empty').textContent=e.message;$('empty').classList.remove('hide');$('detail').classList.add('hide')}}
  $('searchForm').addEventListener('submit',e=>{e.preventDefault();load($('search').value.trim())});$('next').onclick=()=>load($('search').value.trim(),nextToken);bootstrap();
  </script></body></html>`;
  const headers=secureHeaders('text/html; charset=utf-8');
  headers['content-security-policy']="default-src 'self'; style-src 'self' 'unsafe-inline' https://shell.ekodi.kr; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://shell.ekodi.kr; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co https://cdn.jsdelivr.net https://shell.ekodi.kr; img-src 'self' data: https://lh3.googleusercontent.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
  headers['x-ekodi-route']='mail-readonly';
  return new Response(html,{headers});
}
