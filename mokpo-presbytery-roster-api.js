// 목포노회 회원명부(제135회 정기회 기준) — 관리자 전용, 2중확인(에코디 로그인 + 이메일 인증코드).
//
// Routes (Shared Site Core router, same origin as ekodi.kr pages):
//   GET  /api/mokpo-presbytery/roster/status     public: { mailReady } only, no roster data
//   POST /api/mokpo-presbytery/roster/code       step 2a: send a 6-digit code to the signed-in admin's own email
//   POST /api/mokpo-presbytery/roster/verify     step 2b: { code } -> short-lived view grant (30 minutes)
//   GET  /api/mokpo-presbytery/roster            roster, requires Bearer + x-roster-grant
//   POST /api/mokpo-presbytery/roster/classify   { id, section } move an entry (e.g. 미분류 -> 시찰), requires grant
//
// Invariants:
// - Step 1 is a verified EKODI (Supabase) session: email confirmed, checked against /auth/v1/user.
// - Authority: platform super_admin (admins + active admin_google_accounts super_admin row) or an active row
//   in mokpo_presbytery_roster_admins. Everyone else gets 403 and no code is sent.
// - The code goes only to the verified email of the same session. Stored as SHA-256(id:email:code), 10 minutes,
//   5 attempts, at most 5 codes per hour per email. Grants are random 32-byte tokens stored hashed, bound to the email.
// - Roster rows live only in D1 (never in this repository). Responses are private, no-store. Logs carry no roster fields.
import { principalFromSupabaseRequest } from './ekodi-principal.js';

export const ROSTER_API_PREFIX='/api/mokpo-presbytery/roster';
export const ROSTER_MAIL_FROM='joseph@ekodi.kr';
export const SECTIONS=Object.freeze(['목포','목포동','신안','신안동부','함무','기관·전도목사','미분류']);
export const CODE_TTL_MS=10*60*1000;
export const GRANT_TTL_MS=30*60*1000;
export const MAX_ATTEMPTS=5;
export const CODES_PER_HOUR=5;
const MAX_BODY=2048;
const encoder=new TextEncoder();

export function isRosterApiPath(pathname){
  return pathname===ROSTER_API_PREFIX||pathname.startsWith(ROSTER_API_PREFIX+'/');
}

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-robots-tag':'noindex, nofollow',
    'x-ekodi-route':'mokpo-presbytery-roster',
  }});
}
const fail=(code,error,status)=>json({ok:false,code,error},status);

function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(String(value))));}
function randomHex(n){const b=new Uint8Array(n);crypto.getRandomValues(b);return hex(b);}
export function randomCode(){
  const buf=new Uint32Array(1);
  for(;;){crypto.getRandomValues(buf);if(buf[0]<4294000000)return String(buf[0]%1000000).padStart(6,'0');}
}
function sameHex(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
export function maskEmail(email){
  const [local,domain]=String(email||'').split('@');
  if(!domain)return '';
  return (local.length<=2?local[0]+'*':local.slice(0,2)+'*'.repeat(Math.min(6,local.length-2)))+'@'+domain;
}
function originAllowed(request,env){
  const origin=String(request.headers.get('origin')||'');
  if(origin==='https://ekodi.kr')return true;
  return env?.ENVIRONMENT!=='production'&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
async function readBody(request){
  const raw=await request.text().catch(()=>'');
  if(raw.length>MAX_BODY)return null;
  try{const v=JSON.parse(raw||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}
}

export async function rosterAdminEmail(env,email){
  const target=String(email||'').trim().toLowerCase();
  if(!target||!env?.DB?.prepare)return false;
  const superAdmin=await env.DB.prepare("SELECT a.role FROM admins a JOIN admin_google_accounts g ON lower(trim(g.email))=lower(trim(a.email)) WHERE lower(trim(a.email))=? AND a.role='super_admin' AND g.role='super_admin' AND g.status='active' LIMIT 1")
    .bind(target).first().catch(()=>null);
  if(superAdmin)return true;
  const listed=await env.DB.prepare("SELECT email FROM mokpo_presbytery_roster_admins WHERE lower(trim(email))=? AND status='active' LIMIT 1")
    .bind(target).first().catch(()=>null);
  return Boolean(listed);
}

async function defaultSendMail(env,to,code){
  const {serviceAccountToken}=await import('./mail-user-page.js');
  const {sendGoogleMailMessage}=await import('./mail-google-adapter.js');
  const token=await serviceAccountToken(ROSTER_MAIL_FROM,env,'https://www.googleapis.com/auth/gmail.send');
  await sendGoogleMailMessage(token,{to,subject:'[목포노회] 회원명부 열람 인증코드',body:
    `목포노회 회원명부 열람 인증코드: ${code}\n\n10분 안에 화면에 입력해 주세요. 열람은 30분 동안 유지됩니다.\n본인이 요청하지 않았다면 이 메일을 무시하고 노회 서기에게 알려 주십시오.\n\n※ 이 메일에는 명부 내용이 들어 있지 않습니다.`});
}
export function mailReady(env){return Boolean(env?.GOOGLE_SERVICE_ACCOUNT_EMAIL&&env?.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);}

async function audit(env,email,action,detail=''){
  await env.DB.prepare('INSERT INTO mokpo_presbytery_roster_audit(email,action,detail,created_at) VALUES (?,?,?,?)')
    .bind(email,action,String(detail).slice(0,200),Date.now()).run().catch(()=>{});
}

export function mailFailureReason(error){
  const text=String(error?.message||'').replace(/[\r\n]+/g,' ').slice(0,120);
  if(error?.code==='GOOGLE_TOKEN_EXCHANGE_FAILED')return `google_token: ${text}`;
  if(error?.status)return `gmail_${error.status}: ${text}`;
  return text||'mail_error';
}
async function authorize(request,env,opts){
  const principal=await (opts.principal||principalFromSupabaseRequest)(request);
  const email=String(principal?.email||'').trim().toLowerCase();
  if(!email)return {error:fail('AUTH_REQUIRED','에코디 로그인이 필요합니다.',401)};
  if(!(await (opts.isAdmin||rosterAdminEmail)(env,email)))return {error:fail('ROSTER_ADMIN_REQUIRED','회원명부 열람 권한이 없습니다.',403)};
  return {email};
}
async function grantValid(request,env,email,now){
  const grant=String(request.headers.get('x-roster-grant')||'');
  if(!/^[0-9a-f]{64}$/.test(grant))return false;
  const row=await env.DB.prepare('SELECT email,expires_at FROM mokpo_presbytery_roster_grants WHERE token_hash=?').bind(await sha256(grant)).first().catch(()=>null);
  return Boolean(row&&row.email===email&&Number(row.expires_at)>now);
}

export async function handleRosterApi(request,env,opts={}){
  const url=new URL(request.url);
  if(!isRosterApiPath(url.pathname))return null;
  const now=Number(opts.now?.()??Date.now());
  const sub=url.pathname.slice(ROSTER_API_PREFIX.length)||'/';
  if(!env?.DB?.prepare)return fail('ROSTER_STORE_UNAVAILABLE','명부 저장소에 연결할 수 없습니다.',503);

  if(sub==='/status'&&request.method==='GET')return json({ok:true,mailReady:Boolean(opts.sendMail)||mailReady(env)});

  if(request.method==='POST'&&!originAllowed(request,env))return fail('ORIGIN_FORBIDDEN','허용되지 않은 요청입니다.',403);
  const who=await authorize(request,env,opts);
  if(who.error)return who.error;
  const email=who.email;

  if(sub==='/code'&&request.method==='POST'){
    const sendMail=opts.sendMail||((to,code)=>defaultSendMail(env,to,code));
    if(!opts.sendMail&&!mailReady(env))return fail('MAIL_NOT_CONFIGURED','인증 메일 발송이 아직 설정되지 않았습니다.',503);
    const recent=await env.DB.prepare('SELECT COUNT(*) AS n FROM mokpo_presbytery_roster_codes WHERE email=? AND created_at>?').bind(email,now-60*60*1000).first();
    if(Number(recent?.n||0)>=CODES_PER_HOUR)return fail('CODE_RATE_LIMITED','인증코드 요청이 너무 많습니다. 1시간 뒤에 다시 시도해 주세요.',429);
    const id=randomHex(16),code=randomCode();
    await env.DB.prepare('INSERT INTO mokpo_presbytery_roster_codes(id,email,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,0,?)')
      .bind(id,email,await sha256(`${id}:${email}:${code}`),now+CODE_TTL_MS,now).run();
    try{await sendMail(email,code);}catch(error){
      await env.DB.prepare('DELETE FROM mokpo_presbytery_roster_codes WHERE id=?').bind(id).run().catch(()=>{});
      const reason=mailFailureReason(error);
      console.error('Mokpo roster code mail failed',reason);
      // The caller is an authenticated roster admin; the reason carries Google's error text only, never secrets.
      return json({ok:false,code:'MAIL_SEND_FAILED',error:'인증 메일을 보내지 못했습니다.',reason},502);
    }
    await audit(env,email,'code.sent');
    return json({ok:true,sentTo:maskEmail(email),expiresInSeconds:CODE_TTL_MS/1000});
  }

  if(sub==='/verify'&&request.method==='POST'){
    const body=await readBody(request);
    const code=String(body?.code||'').replace(/\s/g,'');
    if(!/^[0-9]{6}$/.test(code))return fail('CODE_INVALID','인증코드 6자리를 입력해 주세요.',400);
    const row=await env.DB.prepare('SELECT id,code_hash,attempts,expires_at,consumed_at FROM mokpo_presbytery_roster_codes WHERE email=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(email).first();
    if(!row||row.consumed_at!=null||Number(row.expires_at)<=now)return fail('CODE_EXPIRED','인증코드가 만료되었습니다. 새 코드를 받아 주세요.',400);
    if(Number(row.attempts)>=MAX_ATTEMPTS)return fail('CODE_LOCKED','5번 틀려 이 코드는 잠겼습니다. 새 코드를 받아 주세요.',429);
    if(!sameHex(await sha256(`${row.id}:${email}:${code}`),row.code_hash)){
      await env.DB.prepare('UPDATE mokpo_presbytery_roster_codes SET attempts=attempts+1 WHERE id=?').bind(row.id).run();
      await audit(env,email,'code.mismatch');
      return fail('CODE_INVALID','인증코드가 맞지 않습니다.',400);
    }
    const consumed=await env.DB.prepare('UPDATE mokpo_presbytery_roster_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL').bind(now,row.id).run();
    if(Number(consumed?.meta?.changes??1)!==1)return fail('CODE_EXPIRED','인증코드가 이미 사용되었습니다.',400);
    const grant=randomHex(32);
    await env.DB.prepare('DELETE FROM mokpo_presbytery_roster_grants WHERE expires_at<?').bind(now).run().catch(()=>{});
    await env.DB.prepare('INSERT INTO mokpo_presbytery_roster_grants(token_hash,email,expires_at,created_at) VALUES (?,?,?,?)')
      .bind(await sha256(grant),email,now+GRANT_TTL_MS,now).run();
    await audit(env,email,'grant.issued');
    return json({ok:true,grant,expiresAt:new Date(now+GRANT_TTL_MS).toISOString()});
  }

  if(!(await grantValid(request,env,email,now)))return fail('SECOND_FACTOR_REQUIRED','이메일 인증이 필요합니다.',401);

  if(sub==='/'&&request.method==='GET'){
    const rs=await env.DB.prepare('SELECT id,section,seq,kind,church,ministers,elders,address,phone,email,note FROM mokpo_presbytery_roster_entries ORDER BY section,seq,id').all();
    const parse=v=>{try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[];}catch{return [];}};
    const entries=(rs?.results||[]).map(r=>({id:Number(r.id),section:r.section,seq:Number(r.seq),kind:r.kind,church:r.church,
      ministers:parse(r.ministers),elders:parse(r.elders),address:r.address,phone:r.phone,email:r.email,note:r.note}));
    await audit(env,email,'roster.view',String(entries.length));
    return json({ok:true,sections:SECTIONS,entries});
  }

  if(sub==='/classify'&&request.method==='POST'){
    const body=await readBody(request);
    const id=Number(body?.id),section=String(body?.section||'');
    if(!Number.isInteger(id)||id<=0||!SECTIONS.includes(section))return fail('CLASSIFY_INVALID','분류를 확인해 주세요.',400);
    const next=await env.DB.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM mokpo_presbytery_roster_entries WHERE section=?').bind(section).first();
    const r=await env.DB.prepare('UPDATE mokpo_presbytery_roster_entries SET section=?,seq=?,updated_at=? WHERE id=?')
      .bind(section,Number(next?.n||1),new Date(now).toISOString(),id).run();
    if(Number(r?.meta?.changes??0)!==1)return fail('ENTRY_NOT_FOUND','항목을 찾을 수 없습니다.',404);
    await audit(env,email,'roster.classify',`${id}->${section}`);
    return json({ok:true,id,section});
  }
  return fail('NOT_FOUND','지원하지 않는 요청입니다.',404);
}
