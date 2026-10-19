// 2026 제2회 전남폴리텍 모터페스티벌 — 청계면상인회(cgma) 상가 참여 신청 API.
//
// Route (Control API, same origin as ekodi.kr pages):
//   POST /api/merchant-events/motor-festival-2026/applications   anonymous application
//   GET  /api/merchant-events/motor-festival-2026/applications   cgma administrators only
//   GET  ...?view=summary                                        cgma administrators, counts only
//
// Invariants:
// - Storage is the Control API D1 (env.DB). No Supabase service key exists in any Worker.
// - Contact name, phone and free-text notes are AES-GCM encrypted with a key derived from the
//   Worker secret MOTOR_FESTIVAL_PII_KEY. Without the key the API fails closed (503).
// - A receipt code is returned only after the row is read back from D1.
// - Administrator authority is resolved server-side by EKODI tenant authority for tenant `cgma`
//   (platform super_admin, or an active cgma grant whose role may manage access).
// - Logs never contain request bodies or applicant fields.
// - Rows expire at EXPIRES_AT (event + 30 days); purgeExpiredMotorFestivalApplications deletes them.
import { resolveTenantAccessAuthority } from './tenant-access-authority.js';

export const MOTOR_FESTIVAL_API_PATH='/api/merchant-events/motor-festival-2026/applications';
export const MOTOR_FESTIVAL_TENANT='cgma';
export const REGISTRATION_CLOSES_AT=Date.parse('2026-10-25T08:00:00+09:00');
export const EXPIRES_AT='2026-11-23T15:00:00.000Z'; // 2026-11-24 00:00 KST: < 30 days after event end incl. 10-min purge cadence
export const CONSENT_VERSION='mf2026-privacy-v1';
const TABLE='cgma_motor_festival_2026_applications';
const AUDIT='cgma_motor_festival_2026_access_audit';
const MAX_BODY=8192;
export const CLIENT_WINDOW_MS=10*60*1000,CLIENT_LIMIT=20; // shared shop Wi-Fi / mobile CGNAT tolerant
export const PHONE_WINDOW_MS=24*60*60*1000,PHONE_LIMIT=3;
// Global ceiling (≈30× the 74-member association): a flood fails closed instead of burying real rows.
export const MAX_APPLICATIONS=2000;

const CATEGORIES=['음식·분식','커피·음료·디저트','농특산물·가공식품','생활용품·잡화','공예·체험·서비스','기타'];
const MEMBERSHIPS=['regular','join','info','none'];
const INTENTS=['yes','maybe','no'];
const ACTIVITIES=['판매','음식·음료','체험','홍보','시식·시연'];
const SUPPORTS=['테이블','의자','전기','급수','홍보공간'];
const HOURS=['all','am','pm','discuss'];
const STAFF=['1','2','3+'];
const ALLOWED_KEYS=new Set(['business_name','contact_name','phone','category','membership','intent','activity','items','hours','support','staff','notes','consent','website']);
const RECEIPT_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-ekodi-route':'cgma-motor-festival-2026',
    ...extra,
  }});
}
const fail=(code,message,status=400,extra)=>json({ok:false,code,error:message},status,extra);
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max+1):'';

// ---------- validation ----------
export function validateApplication(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,code:'INVALID_BODY'};
  if(Object.keys(body).some(key=>!ALLOWED_KEYS.has(key)))return {ok:false,code:'UNRECOGNIZED_FIELD'};
  if(typeof body.website==='string'&&body.website.trim())return {ok:false,code:'INVALID_APPLICATION'}; // honeypot
  const consent=body.consent===true||body.consent==='on';
  if(!consent)return {ok:false,code:'CONSENT_REQUIRED'};
  const business=text(body.business_name,100),contact=text(body.contact_name,60),phoneRaw=text(body.phone,20);
  if(business.length<1||business.length>100)return {ok:false,code:'BUSINESS_NAME_REQUIRED'};
  if(contact.length<1||contact.length>60)return {ok:false,code:'CONTACT_NAME_REQUIRED'};
  if(!/^[0-9+() -]{9,20}$/.test(phoneRaw))return {ok:false,code:'PHONE_INVALID'};
  const digits=phoneRaw.replace(/\D/g,'');
  if(digits.length<9||digits.length>15)return {ok:false,code:'PHONE_INVALID'};
  if(!CATEGORIES.includes(body.category))return {ok:false,code:'CATEGORY_INVALID'};
  if(!MEMBERSHIPS.includes(body.membership))return {ok:false,code:'MEMBERSHIP_INVALID'};
  if(!INTENTS.includes(body.intent))return {ok:false,code:'INTENT_INVALID'};
  const list=(value,allowed)=>{
    if(value===undefined||value===null||value==='')return [];
    const arr=Array.isArray(value)?value:[value];
    if(arr.length>allowed.length||arr.some(v=>!allowed.includes(v)))return null;
    return [...new Set(arr)];
  };
  const activity=list(body.activity,ACTIVITIES),support=list(body.support,SUPPORTS);
  if(!activity)return {ok:false,code:'ACTIVITY_INVALID'};
  if(!support)return {ok:false,code:'SUPPORT_INVALID'};
  const hours=body.hours===undefined?'all':body.hours,staff=body.staff===undefined?'1':body.staff;
  if(!HOURS.includes(hours))return {ok:false,code:'HOURS_INVALID'};
  if(!STAFF.includes(staff))return {ok:false,code:'STAFF_INVALID'};
  if(body.items!==undefined&&typeof body.items!=='string')return {ok:false,code:'ITEMS_INVALID'};
  if(body.notes!==undefined&&typeof body.notes!=='string')return {ok:false,code:'NOTES_INVALID'};
  const items=text(body.items||'',300),notes=text(body.notes||'',1000);
  if(items.length>300||notes.length>1000)return {ok:false,code:'TEXT_TOO_LONG'};
  return {ok:true,value:{business,contact,phone:phoneRaw,digits,category:body.category,membership:body.membership,
    intent:body.intent,activity,support,hours,staff,items,notes}};
}

// ---------- crypto ----------
const enc=new TextEncoder(),dec=new TextDecoder();
const b64u=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u=value=>{const s=value.replace(/-/g,'+').replace(/_/g,'/');const bin=atob(s+'='.repeat((4-s.length%4)%4));return Uint8Array.from(bin,c=>c.charCodeAt(0));};
const keyCache=new Map();
export async function motorFestivalKeys(secret){
  const raw=String(secret||'');
  if(raw.length<32)return null;
  if(keyCache.has(raw))return keyCache.get(raw);
  const base=await crypto.subtle.importKey('raw',enc.encode(raw),'HKDF',false,['deriveKey']);
  const derive=(info,algorithm,usages)=>crypto.subtle.deriveKey(
    {name:'HKDF',hash:'SHA-256',salt:enc.encode('ekodi:cgma:motor-festival-2026'),info:enc.encode(info)},
    base,algorithm,false,usages);
  const keys={
    aes:await derive('pii-aes-gcm-v1',{name:'AES-GCM',length:256},['encrypt','decrypt']),
    mac:await derive('lookup-hmac-v1',{name:'HMAC',hash:'SHA-256',length:256},['sign']),
  };
  keyCache.set(raw,keys);
  return keys;
}
const aadFor=(column,rowId)=>enc.encode(`${TABLE}|${column}|${rowId}|v1`);
export async function sealField(keys,value,column='',rowId=''){
  if(!value)return '';
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aadFor(column,rowId)},keys.aes,enc.encode(value));
  return 'v1.'+b64u(iv)+'.'+b64u(ct);
}
export async function openField(keys,sealed,column='',rowId=''){
  if(!sealed)return '';
  const [version,iv,ct]=String(sealed).split('.');
  if(version!=='v1'||!iv||!ct)throw new Error('SEALED_FORMAT');
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(iv),additionalData:aadFor(column,rowId)},keys.aes,unb64u(ct));
  return dec.decode(pt);
}
async function lookupHash(keys,value){return b64u(await crypto.subtle.sign('HMAC',keys.mac,enc.encode(value)));}
function receiptCode(){
  const bytes=crypto.getRandomValues(new Uint8Array(8));
  return 'MF26-'+Array.from(bytes,b=>RECEIPT_ALPHABET[b%RECEIPT_ALPHABET.length]).join('');
}

// ---------- request helpers ----------
async function readJson(request){
  const declared=Number(request.headers.get('content-length')||0);
  if(declared>MAX_BODY)return {tooLarge:true};
  const reader=request.body?.getReader();
  if(!reader)return {value:null};
  const chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BODY){await reader.cancel().catch(()=>{});return {tooLarge:true};}
      chunks.push(value);
    }
  }finally{try{reader.releaseLock()}catch{}}
  const buf=new Uint8Array(size);let offset=0;for(const c of chunks){buf.set(c,offset);offset+=c.byteLength;}
  try{return {value:JSON.parse(dec.decode(buf))}}catch{return {value:null}}
}
function sameOriginWrite(request){
  const origin=request.headers.get('origin');
  if(origin&&origin!=='https://ekodi.kr')return false;
  const site=request.headers.get('sec-fetch-site');
  if(site&&!['same-origin','none'].includes(site))return false;
  return request.headers.get('x-ekodi-intake-request')==='1';
}
function idempotencyKey(request){
  const key=String(request.headers.get('idempotency-key')||'').trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(key)?key:null;
}
const clientAddress=request=>String(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'unknown').slice(0,64);

// ---------- POST ----------
async function submit(request,env,{now}){
  // Origin first: cross-origin writes are always 403, before and after the deadline.
  if(!sameOriginWrite(request))return fail('ORIGIN_FORBIDDEN','허용되지 않은 요청 출처입니다.',403);
  if(now>=REGISTRATION_CLOSES_AT)return fail('REGISTRATION_CLOSED','신청이 마감되었습니다. (2026-10-25 08:00 마감)',410);
  if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return fail('CONTENT_TYPE_INVALID','JSON 요청만 허용됩니다.',415);
  const key=idempotencyKey(request);
  if(!key)return fail('IDEMPOTENCY_KEY_REQUIRED','신청 고유번호가 필요합니다. 페이지를 새로고침해 주세요.');
  const parsed=await readJson(request);
  if(parsed.tooLarge)return fail('TOO_LARGE','요청 크기가 너무 큽니다.',413);
  const validation=validateApplication(parsed.value);
  if(!validation.ok)return fail(validation.code,'입력 내용을 확인해 주세요.');
  const keys=await motorFestivalKeys(env.MOTOR_FESTIVAL_PII_KEY);
  if(!keys)return fail('ENCRYPTION_UNAVAILABLE','접수 보안 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.',503);
  const v=validation.value;
  const phoneHash=await lookupHash(keys,'phone:'+v.digits);
  const clientHash=await lookupHash(keys,'client:'+clientAddress(request));

  // Idempotent replay: the same browser submission returns the same receipt, never a second row.
  const existing=await env.DB.prepare(`SELECT receipt_code,phone_hash,business_name FROM ${TABLE} WHERE submission_key=? LIMIT 1`).bind(key).first();
  if(existing){
    if(existing.phone_hash!==phoneHash||existing.business_name!==v.business)return fail('IDEMPOTENCY_CONFLICT','이미 다른 내용으로 사용된 신청 고유번호입니다. 새로고침 후 다시 신청해 주세요.',409);
    return json({ok:true,reused:true,receipt_id:existing.receipt_code},200);
  }

  // The Shared Site edge limiter keys on IP+user-agent and is easy to rotate around, so these D1 windows
  // (per network, per phone, global ceiling) are the authoritative limits for this path.
  const since=iso=>new Date(now-iso).toISOString();
  const counts=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM ${TABLE} WHERE client_hash=? AND created_at>=?) AS client_recent,
      (SELECT COUNT(*) FROM ${TABLE} WHERE phone_hash=? AND created_at>=?) AS phone_recent,
      (SELECT COUNT(*) FROM ${TABLE}) AS total`)
    .bind(clientHash,since(CLIENT_WINDOW_MS),phoneHash,since(PHONE_WINDOW_MS)).first();
  if(Number(counts?.total||0)>=MAX_APPLICATIONS)return fail('CAPACITY_REACHED','접수 한도에 도달했습니다. 청계면상인회로 직접 문의해 주세요.',429,{'retry-after':'3600'});
  if(Number(counts?.client_recent||0)>=CLIENT_LIMIT)return fail('TOO_MANY_REQUESTS','같은 네트워크에서 신청이 너무 많습니다. 10분 후 다시 시도해 주세요.',429,{'retry-after':'600'});
  if(Number(counts?.phone_recent||0)>=PHONE_LIMIT)return fail('DUPLICATE_LIMIT','같은 연락처로 이미 여러 번 신청되었습니다. 수정이 필요하면 상인회로 연락해 주세요.',429,{'retry-after':'3600'});

  const createdAt=new Date(now).toISOString();
  let receipt='';
  for(let attempt=0;attempt<3&&!receipt;attempt++){
    const id=crypto.randomUUID(),code=receiptCode();
    const [contactEnc,phoneEnc,notesEnc]=await Promise.all([
      sealField(keys,v.contact,'contact_name',id),sealField(keys,v.phone,'phone',id),sealField(keys,v.notes,'notes',id)]);
    await env.DB.prepare(`INSERT OR IGNORE INTO ${TABLE}
        (id,receipt_code,submission_key,business_name,category,membership,intent,activity_json,items,hours,support_json,staff,
         contact_name_enc,phone_enc,notes_enc,phone_hash,client_hash,key_version,consent_version,created_at,expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,code,key,v.business,v.category,v.membership,v.intent,JSON.stringify(v.activity),v.items,v.hours,
        JSON.stringify(v.support),v.staff,contactEnc,phoneEnc,notesEnc,phoneHash,clientHash,'v1',CONSENT_VERSION,createdAt,EXPIRES_AT)
      .run();
    // Read back: only a persisted row may produce a receipt.
    const stored=await env.DB.prepare(`SELECT id,receipt_code,phone_hash,business_name FROM ${TABLE} WHERE submission_key=? LIMIT 1`).bind(key).first();
    if(stored){
      if(stored.id!==id){
        if(stored.phone_hash!==phoneHash||stored.business_name!==v.business)return fail('IDEMPOTENCY_CONFLICT','이미 다른 내용으로 사용된 신청 고유번호입니다.',409);
        return json({ok:true,reused:true,receipt_id:stored.receipt_code},200);
      }
      receipt=stored.receipt_code;
    }
  }
  if(!receipt)return fail('STORAGE_FAILURE','신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);
  return json({ok:true,receipt_id:receipt,closes_at:new Date(REGISTRATION_CLOSES_AT).toISOString()},201);
}

// ---------- GET (administrators) ----------
export function summarize(rows){
  const tally=(field)=>{const out={};for(const row of rows){const values=Array.isArray(row[field])?row[field]:[row[field]];for(const v of values){if(v)out[v]=(out[v]||0)+1;}}return out;};
  const count=(field,value)=>rows.filter(r=>r[field]===value).length;
  return {
    total:rows.length,
    regular:count('membership','regular'),join:count('membership','join'),info:count('membership','info'),none:count('membership','none'),
    participating:count('intent','yes'),maybe:count('intent','maybe'),declined:count('intent','no'),
    byCategory:tally('category'),byActivity:tally('activity'),bySupport:tally('support'),byHours:tally('hours'),byStaff:tally('staff'),
  };
}
async function audit(env,authority,action,recordCount,now){
  await env.DB.prepare(`INSERT INTO ${AUDIT} (id,actor_email,actor_scope,action,record_count,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),String(authority.email||'').toLowerCase(),String(authority.scope||''),action,recordCount,new Date(now).toISOString()).run();
}
async function list(request,env,{now,resolveAuthority}){
  const authority=await resolveAuthority(request,env,{tenantSlug:MOTOR_FESTIVAL_TENANT});
  if(!authority?.ok){
    const status=authority?.status===401?401:403;
    return fail(status===401?'ADMIN_LOGIN_REQUIRED':'ADMIN_FORBIDDEN',
      status===401?'청계면상인회 관리자 로그인이 필요합니다.':'청계면상인회 행사 관리자 권한이 없습니다.',status);
  }
  if(!['platform','tenant','tenant-delegated'].includes(authority.scope))return fail('ADMIN_FORBIDDEN','청계면상인회 행사 관리자 권한이 없습니다.',403);
  const summaryOnly=new URL(request.url).searchParams.get('view')==='summary';
  const keys=summaryOnly?null:await motorFestivalKeys(env.MOTOR_FESTIVAL_PII_KEY);
  if(!summaryOnly&&!keys)return fail('ENCRYPTION_UNAVAILABLE','복호화 설정을 확인할 수 없습니다.',503);
  const result=await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE expires_at>? ORDER BY created_at DESC LIMIT ${MAX_APPLICATIONS}`).bind(new Date(now).toISOString()).all();
  const rows=(result?.results||[]).map(row=>({
    ...row,activity:JSON.parse(row.activity_json||'[]'),support:JSON.parse(row.support_json||'[]'),
  }));
  const summary=summarize(rows);
  await audit(env,authority,summaryOnly?'summary':'list',rows.length,now);
  if(summaryOnly)return json({ok:true,summary,generated_at:new Date(now).toISOString()});
  let unreadable=0;
  const open=async(sealed,column,id)=>{try{return await openField(keys,sealed,column,id)}catch{unreadable++;return '[복호화 불가]'}};
  const applications=[];
  for(const row of rows){
    applications.push({
      receipt_id:row.receipt_code,created_at:row.created_at,business_name:row.business_name,
      contact_name:await open(row.contact_name_enc,'contact_name',row.id),phone:await open(row.phone_enc,'phone',row.id),
      category:row.category,membership:row.membership,intent:row.intent,activity:row.activity,items:row.items,
      hours:row.hours,support:row.support,staff:row.staff,notes:await open(row.notes_enc,'notes',row.id),
    });
  }
  if(unreadable)console.error('[cgma-motor-festival-2026] unreadable sealed fields',unreadable);
  return json({ok:true,summary,applications,unreadable_fields:unreadable,viewer:{email:authority.email,scope:authority.scope},expires_at:EXPIRES_AT});
}

// ---------- entry ----------
export async function handleMotorFestivalApplications(request,env,options={}){
  const url=new URL(request.url);
  if(url.pathname!==MOTOR_FESTIVAL_API_PATH&&url.pathname!==MOTOR_FESTIVAL_API_PATH+'/')return null;
  if(!env?.DB)return fail('STORAGE_UNAVAILABLE','접수 저장소를 사용할 수 없습니다.',503);
  const now=typeof options.now==='function'?options.now():Date.now();
  const resolveAuthority=options.resolveAuthority||resolveTenantAccessAuthority;
  try{
    if(request.method==='POST')return await submit(request,env,{now});
    if(request.method==='GET')return await list(request,env,{now,resolveAuthority});
    return fail('METHOD_NOT_ALLOWED','허용되지 않은 요청입니다.',405,{allow:'GET, POST'});
  }catch(error){
    // Never log request bodies or applicant fields: error class only.
    console.error('[cgma-motor-festival-2026] operation failed',error?.name||'Error');
    return fail('UNAVAILABLE','일시적인 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);
  }
}

// ---------- retention ----------
export async function purgeExpiredMotorFestivalApplications(env,{now=Date.now()}={}){
  if(!env?.DB)return {ok:false,reason:'db_unavailable',deleted:0};
  const result=await env.DB.prepare(`DELETE FROM ${TABLE} WHERE expires_at<=?`).bind(new Date(now).toISOString()).run();
  const deleted=Number(result?.meta?.changes||0);
  if(deleted)console.log('[cgma-motor-festival-2026] retention purge removed rows',deleted);
  return {ok:true,deleted};
}
