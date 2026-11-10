// BOOKS-GUEST-OTP-001
// Verified-email guest buyers are distinct from EKODI member identities.
// Fail closed until the operator has obtained a separate PG MID for digital goods.
// No unverified email can create an order or access a purchased EPUB.
import { connectedSenderStatus, sendAsConnectedAccount } from './mail-control.js';

const COOKIE = '__Secure-ekodi-books-guest';
const TTL = 7 * 24 * 60 * 60 * 1000;
const CODE_TTL = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const te = new TextEncoder();
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
const cleanEmail = email => String(email || '').trim().toLowerCase();
const yes = value => String(value || '').toLowerCase() === 'true';
function hex(bytes) { return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join(''); }
function token(bytes = 32) { const x = new Uint8Array(bytes); crypto.getRandomValues(x); return hex(x); }
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256',te.encode(value))); }
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw',te.encode(secret),{ name:'HMAC',hash:'SHA-256' },false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,te.encode(value)));
}
function equal(a,b) {
  if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length)return false;
  let diff = 0; for(let i=0;i<a.length;i++)diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function guestConfig(env) {
  // The existing MID q_ekodib62hb is physical-goods-only for underwriting.
  // It MUST NOT be reused for an ebook under the guise of guest checkout.
  const profile = String(env?.EKODIPAY_PROFILE || 'mall');
  const secret = String(env?.BOOKS_GUEST_OTP_SECRET || '');
  const sender = String(env?.BOOKS_GUEST_MAIL_SENDER || '').trim().toLowerCase();
  const enabled = yes(env?.BOOKS_GUEST_CHECKOUT_ENABLED) &&
    yes(env?.BOOKS_DIGITAL_MID_APPROVED) && yes(env?.PAYMENTS_ENABLED) &&
    profile !== 'mall' && secret.length >= 32 && sender === 'ekodibiz@gmail.com' &&
    env?.DATA_MODE !== 'isolated-staging';
  return { enabled:Boolean(enabled), secret, sender };
}
function allowedOrigin(request) {
  const origin = request.headers.get('origin') || '';
  const url = new URL(request.url);
  const own = url.origin;
  return origin === 'https://ekodi.kr' ||
    (origin === own && url.hostname.endsWith('.workers.dev'));
}
function response(data,status=200,cookie='') {
  const headers = new Headers({ 'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer' });
  if(cookie)headers.set('set-cookie',cookie);
  return new Response(JSON.stringify(data),{status,headers});
}
const deny = (code,error,status=403) => response({ok:false,code,error},status);
const cookieFor = (t,maxAge) => COOKIE + '=' + t +
  '; Path=/books; Secure; HttpOnly; SameSite=Lax; Max-Age=' + maxAge;
function bearerCookie(request) {
  const raw = request.headers.get('cookie') || '';
  const parts = raw.split(';').map(x=>x.trim());
  const found = parts.find(x=>x.startsWith(COOKIE+'='));
  const value = found?.slice(COOKIE.length+1) || '';
  return /^[0-9a-f]{64}$/.test(value)?value:'';
}
export async function guestBuyer(env,request,now=Date.now()) {
  const cfg = guestConfig(env);
  const tok = cfg.enabled && bearerCookie(request);
  if(!tok)return null;
  const row = await env.DB.prepare('SELECT buyer_id,email,expires_at FROM books_guest_sessions WHERE token_hash=? AND expires_at>?')
    .bind(await digest(tok),now).first().catch(()=>null);
  if(!row || !/^guest-[0-9a-f]{40}$/.test(row.buyer_id) || !validEmail(row.email))return null;
  return { userId:row.buyer_id,email:row.email,name:'',isGuest:true };
}
async function featureReady(env) {
  const cfg = guestConfig(env);
  if(!cfg.enabled || !env.DB?.prepare)return false;
  const status = await connectedSenderStatus(env,[cfg.sender]).catch(()=>[]);
  return Boolean(status[0]?.ready);
}
export async function guestEndpoint(env,request,path,body={},options={}) {
  const now = Number(options.now || Date.now());
  const cfg = guestConfig(env);
  if(path==='/guest/readiness' && request.method==='GET')
    return response({ok:true,available:await featureReady(env),requiresEmailVerification:true,memberRegistrationRequired:false});
  if(path==='/guest/status' && request.method==='GET') {
    const buyer = await guestBuyer(env,request,now);
    return response({ok:true,verified:Boolean(buyer),email:buyer?buyer.email.replace(/^(.{2}).*(@.*)$/,'$1***$2'):''});
  }
  if(!cfg.enabled)return deny('GUEST_NOT_ENABLED','전자책 비회원 결제는 디지털상품 전용 가맹점 승인 후 개통됩니다.',503);
  if(!allowedOrigin(request) || request.headers.get('content-type')?.split(';')[0]!=='application/json')
    return deny('ORIGIN_DENIED','보안상 이 요청은 허용되지 않습니다.',403);
  if(path==='/guest/signout' && request.method==='POST') {
    const tok = bearerCookie(request);
    if(tok)await env.DB.prepare('DELETE FROM books_guest_sessions WHERE token_hash=?').bind(await digest(tok)).run();
    return response({ok:true},200,cookieFor('',0));
  }
  if(path==='/guest/start' && request.method==='POST') {
    // Injected mail readiness exists only for isolated unit tests; production passes no options.
    if(options.mailReady !== true && !await featureReady(env))return deny('MAIL_UNAVAILABLE','이메일 인증을 준비하고 있습니다.',503);
    const email = cleanEmail(body.email);
    if(!validEmail(email))return deny('EMAIL_INVALID','올바른 이메일을 입력해 주세요.',400);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipHash = await hmac(cfg.secret,'ip:'+ip);
    const emailHash = await hmac(cfg.secret,'email:'+email);
    const since = now - HOUR;
    const recentEmail = await env.DB.prepare('SELECT COUNT(*) AS n FROM books_guest_challenges WHERE email_hash=? AND created_at>?').bind(emailHash,since).first();
    const recentIp = await env.DB.prepare('SELECT COUNT(*) AS n FROM books_guest_challenges WHERE ip_hash=? AND created_at>?').bind(ipHash,since).first();
    if((recentEmail?.n||0)>=3 || (recentIp?.n||0)>=20)
      return deny('RATE_LIMITED','인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',429);
    const id = crypto.randomUUID();
    const number = new Uint32Array(1);
    let code;
    do {crypto.getRandomValues(number);}while(number[0]>=4294000000);
    code = String(number[0]%1000000).padStart(6,'0');
    const codeHash = await hmac(cfg.secret,id+':'+email+':'+code);
    await env.DB.prepare('INSERT INTO books_guest_challenges(id,email,email_hash,ip_hash,code_hash,attempts,expires_at,created_at) VALUES(?,?,?,?,?,0,?,?)')
      .bind(id,email,emailHash,ipHash,codeHash,now+CODE_TTL,now).run();
    try {
      const send = options.sendCode || ((to,otp)=>sendAsConnectedAccount(env,cfg.sender,
        {to,subject:'[에코디서점] 비회원 구매 이메일 인증번호',text:'전자책 구매 인증번호: '+otp+
          '\n10분간 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.'}));
      await send(email,code);
    } catch {
      await env.DB.prepare('DELETE FROM books_guest_challenges WHERE id=?').bind(id).run().catch(()=>{});
      return deny('MAIL_SEND_FAILED','인증메일을 전송할 수 없습니다. 잠시 후 다시 시도해 주세요.',503);
    }
    return response({ok:true,challengeId:id,expiresInSeconds:600},200);
  }
  if(path==='/guest/verify' && request.method==='POST') {
    const id = String(body.challengeId||'');
    const code = String(body.code||'');
    if(!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9]{6}$/.test(code))
      return deny('CODE_INVALID','인증번호를 확인해 주세요.',400);
    const attempts = await env.DB.prepare('UPDATE books_guest_challenges SET attempts=attempts+1 WHERE id=? AND consumed_at IS NULL AND expires_at>? AND attempts<?')
      .bind(id,now,MAX_ATTEMPTS).run();
    if(!attempts.meta?.changes)return deny('CODE_EXPIRED','인증이 만료되거나 시도 횟수를 초과했습니다.',410);
    const row = await env.DB.prepare('SELECT email,code_hash FROM books_guest_challenges WHERE id=? AND consumed_at IS NULL').bind(id).first();
    if(!row || !equal(row.code_hash,await hmac(cfg.secret,id+':'+row.email+':'+code)))
      return deny('CODE_INVALID','인증번호가 맞지 않습니다.',403);
    const consumed = await env.DB.prepare('UPDATE books_guest_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL')
      .bind(now,id).run();
    if(!consumed.meta?.changes)return deny('CODE_USED','이미 처리된 인증입니다.',409);
    const idHash = await hmac(cfg.secret,'guest:'+row.email);
    const buyerId = 'guest-'+idHash.slice(0,40);
    const tok = token();
    await env.DB.prepare('INSERT INTO books_guest_sessions(token_hash,buyer_id,email,expires_at,created_at) VALUES(?,?,?,?,?)')
      .bind(await digest(tok),buyerId,row.email,now+TTL,now).run();
    return response({ok:true,verified:true,expiresInSeconds:TTL/1000},200,cookieFor(tok,Math.floor(TTL/1000)));
  }
  return deny('NOT_FOUND','지원하지 않는 요청입니다.',404);
}
