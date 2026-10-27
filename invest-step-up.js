// /v1/invest/autopilot/step-up: second-factor ("본인인증") for the owner-only investment workspace.
// A Google/EKODI login alone is not enough: the owner must also answer a knowledge factor
// (registered phone number or a part of the registered address). Answers are never stored or
// logged in clear text; only salted PBKDF2 hashes of normalized fragments live in D1, seeded
// out-of-band (never in this public repository). Verification issues a short-lived random
// session token whose SHA-256 is stored server-side and bound to the owner subject.

export const STEP_UP_HEADER='x-ekodi-invest-step-up';
export const STEP_UP_TTL_MS=8*60*60*1000;
export const STEP_UP_LIMITS=Object.freeze({windowMs:15*60*1000,windowFailures:5,dayMs:24*60*60*1000,dayFailures:15});
export const STEP_UP_KINDS=Object.freeze(['phone','address']);
const PBKDF2_ITERATIONS=100000;
const enc=new TextEncoder();

// Phone: digits only. Address: drop whitespace and common punctuation, lower-case Latin.
export function normalizeStepUpAnswer(kind,value){
 const raw=String(value??'').normalize('NFKC').slice(0,200);
 if(kind==='phone')return raw.replace(/\D+/g,'');
 return raw.toLowerCase().replace(/[\s\-–—_,.·:;'"()\[\]{}#/\\]+/g,'');
}

// The answer may contain more than the registered fragment (e.g. full number with 010, or
// region + road address). Only the trailing fragment of the registered length is compared.
export function candidateFragment(kind,answer,length){
 const value=normalizeStepUpAnswer(kind,answer);
 const n=Number(length);
 if(!Number.isInteger(n)||n<4||value.length<n)return '';
 return value.slice(value.length-n);
}

const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function hashStepUpFragment(fragment,saltHex,iterations=PBKDF2_ITERATIONS){
 const key=await crypto.subtle.importKey('raw',enc.encode(fragment),'PBKDF2',false,['deriveBits']);
 const salt=new Uint8Array(String(saltHex).match(/../g).map(h=>parseInt(h,16)));
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
export async function sha256Hex(text){return hex(await crypto.subtle.digest('SHA-256',enc.encode(String(text))))}
export function safeEqual(a,b){
 const x=String(a),y=String(b);
 let diff=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x.charCodeAt(i)||0)^(y.charCodeAt(i)||0);
 return diff===0;
}
export function newStepUpToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// Pure lockout decision from recent failure timestamps (ms).
export function stepUpLockout(failures,now=Date.now()){
 const recent=failures.filter(t=>now-t<STEP_UP_LIMITS.windowMs);
 const day=failures.filter(t=>now-t<STEP_UP_LIMITS.dayMs);
 if(day.length>=STEP_UP_LIMITS.dayFailures)return {locked:true,retryAfterMs:STEP_UP_LIMITS.dayMs-(now-Math.min(...day))};
 if(recent.length>=STEP_UP_LIMITS.windowFailures)return {locked:true,retryAfterMs:STEP_UP_LIMITS.windowMs-(now-Math.min(...recent))};
 return {locked:false,retryAfterMs:0};
}

export async function matchStepUpAnswer(answer,factors){
 let matched=false;
 for(const f of factors){
  if(!STEP_UP_KINDS.includes(f.kind))continue;
  const fragment=candidateFragment(f.kind,answer,f.fragment_length);
  // Always hash (even on empty candidate) so timing does not reveal which factor shape matched.
  const digest=await hashStepUpFragment(fragment||'\u0000',f.salt,Number(f.iterations)||PBKDF2_ITERATIONS);
  if(fragment&&safeEqual(digest,f.hash))matched=true;
 }
 return matched;
}

async function factorsFor(env,ctx){
 const rows=await env.DB.prepare(`SELECT kind,salt,hash,fragment_length,iterations FROM investment_step_up_factors WHERE subject_email=? AND active=1`).bind(ctx.identity.email.toLowerCase()).all();
 return rows.results||[];
}

// Returns {verified, expiresAt} for the token presented in the request header.
export async function stepUpSession(request,env,ctx,now=Date.now()){
 const token=String(request.headers.get(STEP_UP_HEADER)||'').trim();
 if(!/^[A-Za-z0-9_-]{40,64}$/.test(token))return {verified:false};
 let row=null;
 try{row=await env.DB.prepare(`SELECT expires_at FROM investment_step_up_sessions WHERE token_hash=? AND subject_email=?`).bind(await sha256Hex(token),ctx.identity.email.toLowerCase()).first()}catch{return {verified:false,unavailable:true}}
 const expires=Date.parse(row?.expires_at||'');
 if(!Number.isFinite(expires)||expires<=now)return {verified:false};
 return {verified:true,expiresAt:new Date(expires).toISOString()};
}

export async function stepUpStatus(request,env,ctx){
 let configured=false;
 try{configured=(await factorsFor(env,ctx)).length>0}catch{return {status:503,body:{error:'STEP_UP_UNAVAILABLE'}}}
 const session=await stepUpSession(request,env,ctx);
 return {status:200,body:{configured,verified:session.verified,expiresAt:session.expiresAt||null,factorHint:'휴대폰 번호 또는 등록 주소의 일부(도로명·건물번호)'}};
}

export async function verifyStepUp(request,env,ctx,answer,audit,now=Date.now()){
 const email=ctx.identity.email.toLowerCase();
 let factors;
 try{factors=await factorsFor(env,ctx)}catch{return {status:503,body:{error:'STEP_UP_UNAVAILABLE'}}}
 if(!factors.length)return {status:503,body:{error:'STEP_UP_NOT_CONFIGURED'}};
 const since=new Date(now-STEP_UP_LIMITS.dayMs).toISOString();
 const failed=(await env.DB.prepare(`SELECT attempted_at FROM investment_step_up_attempts WHERE subject_email=? AND ok=0 AND attempted_at>=?`).bind(email,since).all()).results||[];
 const lock=stepUpLockout(failed.map(r=>Date.parse(r.attempted_at)).filter(Number.isFinite),now);
 if(lock.locked){
  await audit('step_up:locked','warn',{retryAfterSec:Math.ceil(lock.retryAfterMs/1000)});
  return {status:429,body:{error:'STEP_UP_LOCKED',retryAfterSec:Math.ceil(lock.retryAfterMs/1000)}};
 }
 const value=String(answer??'');
 const ok=value.length>=4&&value.length<=200&&await matchStepUpAnswer(value,factors);
 const at=new Date(now).toISOString();
 await env.DB.prepare(`INSERT INTO investment_step_up_attempts(subject_email,ok,attempted_at) VALUES(?,?,?)`).bind(email,ok?1:0,at).run();
 if(!ok){
  const remaining=Math.max(0,STEP_UP_LIMITS.windowFailures-1-failed.filter(r=>now-Date.parse(r.attempted_at)<STEP_UP_LIMITS.windowMs).length);
  await audit('step_up:failed','warn',{remaining});
  return {status:401,body:{error:'STEP_UP_MISMATCH',remaining}};
 }
 const token=newStepUpToken(),expiresAt=new Date(now+STEP_UP_TTL_MS).toISOString();
 await env.DB.prepare(`DELETE FROM investment_step_up_sessions WHERE subject_email=? AND expires_at<=?`).bind(email,at).run();
 await env.DB.prepare(`INSERT INTO investment_step_up_sessions(token_hash,subject_email,expires_at,created_at) VALUES(?,?,?,?)`).bind(await sha256Hex(token),email,expiresAt,at).run();
 await audit('step_up:verified','info',{expiresAt});
 return {status:200,body:{verified:true,token,expiresAt}};
}

export async function revokeStepUp(request,env,ctx){
 const token=String(request.headers.get(STEP_UP_HEADER)||'').trim();
 if(token)await env.DB.prepare(`DELETE FROM investment_step_up_sessions WHERE token_hash=? AND subject_email=?`).bind(await sha256Hex(token),ctx.identity.email.toLowerCase()).run();
 return {status:200,body:{verified:false}};
}
