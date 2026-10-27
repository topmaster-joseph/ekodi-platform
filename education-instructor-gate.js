// EKODI Education — instructor gate for the Premium Studio operator surfaces.
//
// What it protects (instructor decision 2026-10-25): only the instructor-only facilitation notes (talk track and
// answer keys). The Instructor Studio, presenter/audience windows, Learner Lab and shared engine open without a
// password; the studio and presenter unlock the notes through /study/live/unlock/ and fall back to a locked
// notes panel when the notes module is refused.
//
// How: one shared instructor password, verified server-side in the Education Worker (no new DB, no new
// auth system, nothing secret in the browser). A correct password yields a short-lived HttpOnly cookie
// signed with EDU_GATE_SIGNING_KEY (a Worker secret, rotated by the release workflow).
//
// EDU_INSTRUCTOR_GATE is a PBKDF2-SHA256 verifier ("pbkdf2-sha256$<iterations>$<salt>$<hash>", base64url).
// It is a Worker var that may live in a public repository because the password is a random ~79-bit
// value (16 characters from a 31-symbol alphabet): the verifier cannot be inverted in practice. Never store a short, human-chosen password this way.
// Cloudflare Workers cap PBKDF2 at 100,000 iterations.
//
// Instructor-chosen password: the release workflow turns the GitHub Actions secret EDU_INSTRUCTOR_PASSWORD into
// a verifier and stores it as the Worker *secret* EDU_INSTRUCTOR_GATE_SECRET (never in the repository, so a
// human-memorable password is not exposed to offline guessing). When present it replaces the generated
// password entirely; online guessing is bounded by the edge write rate limiter and PBKDF2 cost.
//
// Fail closed: without a verifier or a signing key, protected paths show the lock page and never the content.

// EKODI account unlock (2026-10-27): instructors open the notes with their EKODI account (any login path:
// Google, Naver, Kakao …). The account's verified emails come from the central identity registry and must
// be listed in EDU_INSTRUCTOR_EMAILS (comma separated; defaults to the platform owner). The shared password
// remains only as a transition fallback.
const EKODI_IDENTITY_API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/identity-api';
const EKODI_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const EKODI_AUTH_URL='https://ekodi.kr/auth/';
const DEFAULT_INSTRUCTOR_EMAILS=['topmaster.joseph@gmail.com','joseph@ekodi.kr'];
export function instructorEmails(env){
  const raw=String(env?.EDU_INSTRUCTOR_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  return new Set(raw.length?raw:DEFAULT_INSTRUCTOR_EMAILS);
}
export async function ekodiInstructor(accessToken,env,{fetcher=fetch}={}){
  const token=String(accessToken||'');
  if(!token||token.length>8192)return null;
  try{
    const response=await fetcher(EKODI_IDENTITY_API+'/identities',{headers:{apikey:EKODI_PUBLISHABLE_KEY,authorization:'Bearer '+token,origin:'https://ekodi.kr','cache-control':'no-store'}});
    if(!response.ok)return null;
    const data=await response.json().catch(()=>null);
    const emails=Array.isArray(data?.person?.verifiedEmails)?data.person.verifiedEmails.map(e=>String(e).toLowerCase()):[];
    const allowed=instructorEmails(env);
    const email=emails.find(e=>allowed.has(e));
    return email?{email,ekodiId:data?.person?.ekodiId||null}:null;
  }catch{return null}
}

export const GATE_COOKIE='ekodi_edu_instructor';
export const GATE_TTL_SECONDS=12*60*60;
const TOKEN_CONTEXT='ekodi-edu-instructor-gate:v1:';
const MAX_ITERATIONS=100000;
const enc=new TextEncoder();

const b64u={
  encode(bytes){let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');},
  decode(text){const s=String(text||'').replace(/-/g,'+').replace(/_/g,'/');const pad=s.length%4?'='.repeat(4-s.length%4):'';const raw=atob(s+pad);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
};

// Paths are Education-origin paths (the /edu or /education prefix is already stripped by the router).
export const UNLOCK_PATH='/study/live/unlock/';
const isUnlockPath=p=>p==='/study/live/unlock'||p==='/study/live/unlock/'||p==='/study/live/unlock/index.html';
// The instructor document-share manager page (its API checks the session itself; shared view links are public).
export const isDocsManagerPath=p=>p==='/study/live/docs'||p==='/study/live/docs/'||p==='/study/live/docs/index.html';
export function isGatedPath(pathname){
  const p=String(pathname||'').toLowerCase();
  if(isUnlockPath(p)||isDocsManagerPath(p))return true;
  return /^\/study\/live\/courses\/[^/]+\.notes\.js$/.test(p);
}
const isDocumentPath=p=>!/\.(?:js|mjs|css|json|svg|png|jpe?g|webp|woff2?)$/i.test(String(p||''));

function timingSafeEqual(a,b){
  const x=new Uint8Array(a),y=new Uint8Array(b);
  let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);
  return diff===0;
}

export function parseVerifier(value){
  const parts=String(value||'').trim().split('$');
  if(parts.length!==4||parts[0]!=='pbkdf2-sha256')return null;
  const iterations=Number(parts[1]);
  if(!Number.isInteger(iterations)||iterations<10000||iterations>MAX_ITERATIONS)return null;
  try{const salt=b64u.decode(parts[2]),hash=b64u.decode(parts[3]);if(salt.length<16||hash.length!==32)return null;return {iterations,salt,hash};}catch{return null;}
}
async function pbkdf2(password,salt,iterations){
  const key=await crypto.subtle.importKey('raw',enc.encode(String(password)),'PBKDF2',false,['deriveBits']);
  return crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
}
export async function createVerifier(password,{iterations=MAX_ITERATIONS,salt=crypto.getRandomValues(new Uint8Array(16))}={}){
  const hash=await pbkdf2(password,salt,iterations);
  return 'pbkdf2-sha256$'+iterations+'$'+b64u.encode(salt)+'$'+b64u.encode(hash);
}
export async function verifyPassword(password,verifierText){
  const v=parseVerifier(verifierText);
  const pw=String(password||'');
  if(!v||!pw||pw.length>256)return false;
  return timingSafeEqual(await pbkdf2(pw,v.salt,v.iterations),v.hash);
}

async function hmac(keyText,message){
  const key=await crypto.subtle.importKey('raw',enc.encode(String(keyText)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return crypto.subtle.sign('HMAC',key,enc.encode(message));
}
const usableKey=key=>typeof key==='string'&&key.length>=32;
export async function mintGateToken(signingKey,{now=Date.now(),ttlSeconds=GATE_TTL_SECONDS}={}){
  if(!usableKey(signingKey))throw new Error('gate signing key missing');
  const exp=Math.floor(now/1000)+ttlSeconds;
  return 'v1.'+exp+'.'+b64u.encode(await hmac(signingKey,TOKEN_CONTEXT+exp));
}
export async function verifyGateToken(token,signingKey,{now=Date.now()}={}){
  if(!usableKey(signingKey))return false;
  const m=/^v1\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(String(token||''));
  if(!m)return false;
  const exp=Number(m[1]);
  if(exp*1000<=now||exp*1000>now+GATE_TTL_SECONDS*1000+60000)return false;
  // Compare canonical encodings: base64url's last character carries padding bits that decode identically.
  try{return timingSafeEqual(enc.encode(b64u.encode(await hmac(signingKey,TOKEN_CONTEXT+exp))),enc.encode(m[2]));}catch{return false;}
}
function readCookie(request,name){
  for(const part of String(request.headers.get('cookie')||'').split(';')){
    const i=part.indexOf('=');if(i<0)continue;
    if(part.slice(0,i).trim()===name)return part.slice(i+1).trim();
  }
  return '';
}
// The canonical apex serves this Worker under /edu (router strips the prefix and sets host ekodi.kr).
function cookiePath(url){return url.hostname==='ekodi.kr'?'/edu/study/live':'/';}
function cookieHeader(url,value,maxAge){
  return GATE_COOKIE+'='+value+'; Path='+cookiePath(url)+'; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax';
}
// The canonical apex, or the very origin the Worker was reached on (direct Worker host / local preview).
function sameSiteOrigin(request,url){
  const origin=request.headers.get('origin');
  if(!origin||origin==='null')return !origin;
  return origin==='https://ekodi.kr'||origin===url.origin;
}
// Relative redirect back to the requested document: resolves correctly under /edu, /education or the
// Education origin without the Worker knowing which public prefix the visitor used.
function backTo(url){const seg=url.pathname.endsWith('/')?'./':'./'+url.pathname.split('/').pop();return seg+url.search;}
// The unlock page returns to the studio or the presenter (fixed, relative targets: no open redirect).
function courseOf(url){return (url.searchParams.get('c')||'').replace(/[^a-z0-9-]/gi,'').slice(0,64);}
export function unlockReturn(url){
  const up=url.pathname.endsWith('/')?'../':'./';
  const c=courseOf(url),q=c?'?c='+encodeURIComponent(c):'';
  return up+(url.searchParams.get('back')==='present'?'present/':'')+q;
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function lockPage({message='',configured=true,course='',backHref=''}){
  const lab='/study/live/lab/'+(course?'?c='+encodeURIComponent(course):'');
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
    '<meta name="robots" content="noindex"><meta name="ekodi-ui-type" content="USER"><title>강사 노트 열기 · EKODI Education Premium Studio</title>'+
    '<link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css"><link rel="stylesheet" href="/study/live/live.css"></head>'+
    '<body class="lv gate-body" data-ekodi-ui="USER" data-live-surface="gate"><main class="gate" id="gateMain">'+
    '<section class="gate-card" aria-labelledby="gateTitle"><p class="eyebrow">PREMIUM STUDIO · 강사 전용</p><h1 id="gateTitle">강사 노트 열기</h1>'+
    '<p class="meta">진행 멘트와 정답 해설은 강사로 등록된 에코디 계정으로 열립니다. 강의 화면과 발표 화면은 로그인 없이 쓸 수 있습니다.</p>'+
    (configured?'<div class="gate-form"><button type="button" id="gateEkodi" class="btn btn-primary" data-auth="'+esc(EKODI_AUTH_URL)+'">에코디 계정으로 노트 열기</button>'+
      '<p class="meta" id="gateEkodiStatus" role="status"></p></div>'+
      '<details class="gate-legacy"><summary>공용 강사 비밀번호로 열기 (전환 기간)</summary>'+
      '<form method="post" action="" class="gate-form" autocomplete="on"><label class="field" for="gatePassword">강사 비밀번호</label>'+
      '<input id="gatePassword" name="password" type="password" inputmode="text" autocomplete="current-password" required minlength="4" maxlength="256">'+
      '<button type="submit" class="btn">비밀번호로 열기</button></form></details>'+
      '<script src="/study/live/gate-ekodi.js" defer></script>'
      :'<p class="notice" role="alert">강사 운영실 잠금 설정이 아직 완료되지 않아 열 수 없습니다. 관리자에게 문의하세요.</p>')+
    (message?'<p class="gate-error" role="alert">'+esc(message)+'</p>':'')+
    '<p class="meta">한 번 열면 이 브라우저에서 12시간 동안 유지됩니다. 공용 PC에서는 수업 후 「노트 잠그기」를 누르세요.</p>'+
    (backHref?'<a class="btn" href="'+esc(backHref)+'">← 노트 없이 강의 화면으로</a> ':'')+
    '<a class="btn btn-ghost" href="'+esc(lab)+'">수강생이신가요? 실습실로 가기 →</a></section></main></body></html>';
}
function htmlResponse(html,status,extra={}){
  return new Response(html,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, private','x-robots-tag':'noindex, nofollow',...extra}});
}

// EDU_INSTRUCTOR_GATE_MODE: "open" (no password) or "locked" (default when unset or unrecognised: fail closed).
export function gateMode(env){return String(env?.EDU_INSTRUCTOR_GATE_MODE||'').trim().toLowerCase()==='open'?'open':'locked';}
// The instructor-chosen password (Worker secret) wins over the generated one (public var).
export function activeVerifier(env){
  const custom=env?.EDU_INSTRUCTOR_GATE_SECRET;
  return parseVerifier(custom)?custom:env?.EDU_INSTRUCTOR_GATE;
}
// A short PIN is acceptable only because this verifier is a Worker secret (never public): offline guessing is
// impossible and online guessing is bounded by the edge write rate limiter and PBKDF2 cost per attempt.
export const MIN_CUSTOM_PASSWORD_LENGTH=4;

// Returns a Response when the gate decides the request (lock page, login result, logout, denied asset),
// or null when the request is allowed to reach the protected asset.
export async function instructorGate(request,env,{url=new URL(request.url)}={}){
  if(!isGatedPath(url.pathname))return null;
  const unlock=isUnlockPath(url.pathname.toLowerCase());
  const back=()=>new Response(null,{status:303,headers:{location:unlockReturn(url),'cache-control':'no-store'}});
  // "open" mode (no password) applies only while no instructor-chosen password is configured; a configured
  // Worker secret always locks the notes, whatever the mode var says.
  if(gateMode(env)==='open'&&!parseVerifier(env?.EDU_INSTRUCTOR_GATE_SECRET))return unlock?back():null;
  const verifier=activeVerifier(env);
  const key=env?.EDU_GATE_SIGNING_KEY;
  const configured=!!parseVerifier(verifier)&&usableKey(key);
  const course=courseOf(url);
  const doc=isDocumentPath(url.pathname);
  const method=request.method.toUpperCase();

  if(doc&&method==='GET'&&url.searchParams.get('gate')==='logout'){
    const clean=new URL(url);clean.searchParams.delete('gate');
    return new Response(null,{status:303,headers:{location:unlock?unlockReturn(clean):backTo(clean),'set-cookie':cookieHeader(url,'',0),'cache-control':'no-store'}});
  }
  if(!configured)return doc?htmlResponse(lockPage({configured:false,course,backHref:unlock?unlockReturn(url):''}),503):new Response('locked',{status:503,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'}});

  if(doc&&method==='POST'){
    if(!sameSiteOrigin(request,url))return htmlResponse(lockPage({message:'허용되지 않은 요청입니다.',course,backHref:unlock?unlockReturn(url):''}),403);
    const type=String(request.headers.get('content-type')||'').toLowerCase();
    if(type.startsWith('application/json')){
      const raw=await request.text();
      if(raw.length>9000)return new Response(JSON.stringify({ok:false,error:'too_large'}),{status:413,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
      let body=null;try{body=JSON.parse(raw)}catch{body=null}
      const instructor=await ekodiInstructor(body?.accessToken,env);
      if(!instructor)return new Response(JSON.stringify({ok:false,error:'ekodi_instructor_required',message:'강사로 등록된 에코디 계정이 아닙니다.'}),{status:403,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
      const token=await mintGateToken(key);
      return new Response(JSON.stringify({ok:true,location:unlock?unlockReturn(url):backTo(url)}),{status:200,headers:{'content-type':'application/json; charset=utf-8','set-cookie':cookieHeader(url,token,GATE_TTL_SECONDS),'cache-control':'no-store'}});
    }
    if(!type.startsWith('application/x-www-form-urlencoded'))return htmlResponse(lockPage({message:'입력 형식이 올바르지 않습니다.',course,backHref:unlock?unlockReturn(url):''}),400);
    const raw=await request.text();
    if(raw.length>1024)return htmlResponse(lockPage({message:'입력이 너무 깁니다.',course,backHref:unlock?unlockReturn(url):''}),413);
    const password=new URLSearchParams(raw).get('password')||'';
    if(!(await verifyPassword(password,verifier)))return htmlResponse(lockPage({message:'비밀번호가 맞지 않습니다. 다시 입력해 주세요.',course,backHref:unlock?unlockReturn(url):''}),401);
    const token=await mintGateToken(key);
    return new Response(null,{status:303,headers:{location:unlock?unlockReturn(url):backTo(url),'set-cookie':cookieHeader(url,token,GATE_TTL_SECONDS),'cache-control':'no-store'}});
  }
  if(await verifyGateToken(readCookie(request,GATE_COOKIE),key))return unlock?back():null;
  if(doc&&(method==='GET'||method==='HEAD'))return htmlResponse(lockPage({course,backHref:unlock?unlockReturn(url):''}),401);
  return new Response('instructor sign-in required',{status:401,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8'}});
}

// A signed-in instructor session (password configured and a valid gate cookie). Used by APIs that hold the
// instructor's own documents: unlike the notes, these never open in "open" mode without a password.
export async function hasInstructorSession(request,env){
  const verifier=activeVerifier(env),key=env?.EDU_GATE_SIGNING_KEY;
  if(!parseVerifier(verifier)||!usableKey(key))return false;
  return verifyGateToken(readCookie(request,GATE_COOKIE),key);
}
export function isSameSiteRequest(request,url){return sameSiteOrigin(request,url);}
