// 목포노회 선교부 — 제111회기 총회 국내선교부 정책협의회(2026-12-10) 참석자 명단 접수 API.
// 총회 붙임2 「노회 국내선교부(전도부) 임원 및 정책협의회 참석자 명단」 양식과 같은 항목을 받는다:
// 부서명 · 부서 직책 · 성명 · 교직(목사/장로) · 교회 · 연락처 · 정책협의회 참석(O/X).
//
// Route (Control API, same origin as ekodi.kr pages):
//   POST /api/organizations/mokpo-mission/policy-council-2026/registrations   anonymous, 1–10 people per submission
//   GET  /api/organizations/mokpo-mission/policy-council-2026/registrations   mokpo-mission administrators only
//
// Invariants (same contract as the CGMA motor festival intake):
// - Storage is the Control API D1 (env.DB). Name and phone are AES-GCM encrypted with a key derived from
//   the isolated Worker secret MOKPO_MISSION_PII_KEY. Without the key the API fails closed (503).
// - A receipt code is returned only after every row is read back from D1.
// - Administrator authority is resolved server-side (platform super_admin, or an active mokpo-mission grant).
// - Logs never contain request bodies or registrant fields.
// - Rows expire at EXPIRES_AT (event + 30 days); purgeExpiredMokpoMissionRegistrations deletes them.
import { resolveTenantAccessAuthority } from './tenant-access-authority.js';

export const MOKPO_POLICY_API_PATH='/api/organizations/mokpo-mission/policy-council-2026/registrations';
export const MOKPO_POLICY_TENANT='mokpo-mission';
// 노회 접수 마감: 2026-11-23(월) 24:00 KST. 서기가 취합해 총회 마감(11-25 17:00) 전에 제출한다.
export const REGISTRATION_CLOSES_AT=Date.parse('2026-11-24T00:00:00+09:00');
export const EXPIRES_AT='2027-01-09T15:00:00.000Z'; // 2027-01-10 00:00 KST: 30 days after the 2026-12-10 council
export const CONSENT_VERSION='mokpo-policy2026-privacy-v1';
const TABLE='mokpo_mission_policy_council_2026_registrations';
const AUDIT='mokpo_mission_policy_council_2026_access_audit';
const MAX_BODY=12288;
export const MAX_PEOPLE=10;
export const CLIENT_WINDOW_MS=10*60*1000,CLIENT_LIMIT=30;
export const PHONE_WINDOW_MS=24*60*60*1000,PHONE_LIMIT=3;
export const MAX_REGISTRATIONS=1000;

export const DEPARTMENTS=Object.freeze(['선교부','국내선교부','전도부']);
export const ROLES=Object.freeze(['부장','서기','회계','총무','부원','기타']);
export const CLERGY=Object.freeze(['목사','장로']);
export const ATTEND=Object.freeze(['O','X']);
const ALLOWED_KEYS=new Set(['people','consent','website']);
const PERSON_KEYS=new Set(['dept','role','name','clergy','church','phone','attend']);
const RECEIPT_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-ekodi-route':'mokpo-mission-policy-council-2026',
    ...extra,
  }});
}
const fail=(code,message,status=400,extra)=>json({ok:false,code,error:message},status,extra);
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max+1):'';

// ---------- validation ----------
export function validatePerson(person){
  if(!person||typeof person!=='object'||Array.isArray(person))return {ok:false,code:'PERSON_INVALID'};
  if(Object.keys(person).some(key=>!PERSON_KEYS.has(key)))return {ok:false,code:'UNRECOGNIZED_FIELD'};
  if(!DEPARTMENTS.includes(person.dept))return {ok:false,code:'DEPT_INVALID'};
  if(!ROLES.includes(person.role))return {ok:false,code:'ROLE_INVALID'};
  if(!CLERGY.includes(person.clergy))return {ok:false,code:'CLERGY_INVALID'};
  if(!ATTEND.includes(person.attend))return {ok:false,code:'ATTEND_INVALID'};
  const name=text(person.name,40),church=text(person.church,60),phone=text(person.phone,20);
  if(name.length<1||name.length>40)return {ok:false,code:'NAME_REQUIRED'};
  if(church.length<1||church.length>60)return {ok:false,code:'CHURCH_REQUIRED'};
  if(!/^[0-9+() -]{9,20}$/.test(phone))return {ok:false,code:'PHONE_INVALID'};
  const digits=phone.replace(/\D/g,'');
  if(digits.length<9||digits.length>15)return {ok:false,code:'PHONE_INVALID'};
  return {ok:true,value:{dept:person.dept,role:person.role,name,clergy:person.clergy,church,phone,digits,attend:person.attend}};
}
export function validateSubmission(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,code:'INVALID_BODY'};
  if(Object.keys(body).some(key=>!ALLOWED_KEYS.has(key)))return {ok:false,code:'UNRECOGNIZED_FIELD'};
  if(typeof body.website==='string'&&body.website.trim())return {ok:false,code:'INVALID_SUBMISSION'}; // honeypot
  if(!(body.consent===true||body.consent==='on'))return {ok:false,code:'CONSENT_REQUIRED'};
  if(!Array.isArray(body.people)||body.people.length<1)return {ok:false,code:'PEOPLE_REQUIRED'};
  if(body.people.length>MAX_PEOPLE)return {ok:false,code:'TOO_MANY_PEOPLE'};
  const people=[];
  for(let index=0;index<body.people.length;index++){
    const checked=validatePerson(body.people[index]);
    if(!checked.ok)return {ok:false,code:checked.code,index};
    people.push(checked.value);
  }
  return {ok:true,value:{people}};
}

// ---------- crypto ----------
const enc=new TextEncoder(),dec=new TextDecoder();
const b64u=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u=value=>{const s=value.replace(/-/g,'+').replace(/_/g,'/');const bin=atob(s+'='.repeat((4-s.length%4)%4));return Uint8Array.from(bin,c=>c.charCodeAt(0));};
const keyCache=new Map();
export async function mokpoMissionKeys(secret){
  const raw=String(secret||'');
  if(raw.length<32)return null;
  if(keyCache.has(raw))return keyCache.get(raw);
  const base=await crypto.subtle.importKey('raw',enc.encode(raw),'HKDF',false,['deriveKey']);
  const derive=(info,algorithm,usages)=>crypto.subtle.deriveKey(
    {name:'HKDF',hash:'SHA-256',salt:enc.encode('ekodi:mokpo-mission:policy-council-2026'),info:enc.encode(info)},
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
  return 'MP26-'+Array.from(bytes,b=>RECEIPT_ALPHABET[b%RECEIPT_ALPHABET.length]).join('');
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
const fingerprint=async(keys,people)=>lookupHash(keys,'submission:'+people.map(p=>[p.digits,p.church,p.attend].join('|')).join('/'));

// ---------- POST ----------
async function submit(request,env,{now}){
  if(!sameOriginWrite(request))return fail('ORIGIN_FORBIDDEN','허용되지 않은 요청 출처입니다.',403);
  if(now>=REGISTRATION_CLOSES_AT)return fail('REGISTRATION_CLOSED','노회 접수가 마감되었습니다. 선교부 서기에게 직접 연락해 주세요.',410);
  if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return fail('CONTENT_TYPE_INVALID','JSON 요청만 허용됩니다.',415);
  const key=idempotencyKey(request);
  if(!key)return fail('IDEMPOTENCY_KEY_REQUIRED','신청 고유번호가 필요합니다. 페이지를 새로고침해 주세요.');
  const parsed=await readJson(request);
  if(parsed.tooLarge)return fail('TOO_LARGE','요청 크기가 너무 큽니다.',413);
  const validation=validateSubmission(parsed.value);
  if(!validation.ok)return json({ok:false,code:validation.code,index:validation.index??null,error:'입력 내용을 확인해 주세요.'},400);
  const keys=await mokpoMissionKeys(env.MOKPO_MISSION_PII_KEY);
  if(!keys)return fail('ENCRYPTION_UNAVAILABLE','접수 보안 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.',503);
  const {people}=validation.value;
  const print=await fingerprint(keys,people);
  const clientHash=await lookupHash(keys,'client:'+clientAddress(request));

  const existing=await env.DB.prepare(`SELECT receipt_code,submission_hash FROM ${TABLE} WHERE submission_key=? LIMIT 1`).bind(key).first();
  if(existing){
    if(existing.submission_hash!==print)return fail('IDEMPOTENCY_CONFLICT','이미 다른 내용으로 사용된 신청 고유번호입니다. 새로고침 후 다시 신청해 주세요.',409);
    return json({ok:true,reused:true,receipt_id:existing.receipt_code,count:people.length},200);
  }

  const since=ms=>new Date(now-ms).toISOString();
  const totals=await env.DB.prepare(`SELECT
      (SELECT COUNT(DISTINCT submission_key) FROM ${TABLE} WHERE client_hash=? AND created_at>=?) AS client_recent,
      (SELECT COUNT(*) FROM ${TABLE}) AS total`).bind(clientHash,since(CLIENT_WINDOW_MS)).first();
  if(Number(totals?.total||0)+people.length>MAX_REGISTRATIONS)return fail('CAPACITY_REACHED','접수 한도에 도달했습니다. 선교부 서기에게 직접 연락해 주세요.',429,{'retry-after':'3600'});
  if(Number(totals?.client_recent||0)>=CLIENT_LIMIT)return fail('TOO_MANY_REQUESTS','같은 네트워크에서 신청이 너무 많습니다. 10분 후 다시 시도해 주세요.',429,{'retry-after':'600'});
  const phoneHashes=[];
  for(const p of people){
    const hash=await lookupHash(keys,'phone:'+p.digits);
    phoneHashes.push(hash);
    const recent=await env.DB.prepare(`SELECT COUNT(DISTINCT submission_key) AS n FROM ${TABLE} WHERE phone_hash=? AND created_at>=?`).bind(hash,since(PHONE_WINDOW_MS)).first();
    if(Number(recent?.n||0)>=PHONE_LIMIT)return fail('DUPLICATE_LIMIT','같은 연락처로 이미 여러 번 신청되었습니다. 수정이 필요하면 서기에게 연락해 주세요.',429,{'retry-after':'3600'});
  }

  const createdAt=new Date(now).toISOString();
  for(let attempt=0;attempt<3;attempt++){
    const code=receiptCode();
    const statements=[];
    for(let i=0;i<people.length;i++){
      const p=people[i],id=crypto.randomUUID();
      const [nameEnc,phoneEnc]=await Promise.all([sealField(keys,p.name,'name',id),sealField(keys,p.phone,'phone',id)]);
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO ${TABLE}
          (id,receipt_code,submission_key,seq,submission_hash,dept,role,clergy,church,attend,name_enc,phone_enc,phone_hash,client_hash,
           key_version,consent_version,created_at,expires_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id,code,key,i,print,p.dept,p.role,p.clergy,p.church,p.attend,nameEnc,phoneEnc,phoneHashes[i],clientHash,'v1',CONSENT_VERSION,createdAt,EXPIRES_AT));
    }
    if(typeof env.DB.batch==='function')await env.DB.batch(statements);
    else for(const s of statements)await s.run();
    // Read back: only persisted rows may produce a receipt.
    const stored=await env.DB.prepare(`SELECT receipt_code,submission_hash,COUNT(*) AS n FROM ${TABLE} WHERE submission_key=? GROUP BY receipt_code,submission_hash`).bind(key).all();
    const groups=stored?.results||[];
    if(groups.length===1){
      const g=groups[0];
      if(g.submission_hash!==print)return fail('IDEMPOTENCY_CONFLICT','이미 다른 내용으로 사용된 신청 고유번호입니다.',409);
      if(Number(g.n)===people.length)return json({ok:true,receipt_id:g.receipt_code,count:people.length,closes_at:new Date(REGISTRATION_CLOSES_AT).toISOString()},g.receipt_code===code?201:200);
    }
    // Partial or colliding write: remove this attempt's rows and retry with a fresh receipt.
    await env.DB.prepare(`DELETE FROM ${TABLE} WHERE submission_key=? AND receipt_code=?`).bind(key,code).run();
  }
  return fail('STORAGE_FAILURE','신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);
}

// ---------- GET (administrators) ----------
export function summarize(rows){
  const count=pred=>rows.filter(pred).length;
  return {
    total:rows.length,
    attending:count(r=>r.attend==='O'),declined:count(r=>r.attend==='X'),
    pastors:count(r=>r.clergy==='목사'),elders:count(r=>r.clergy==='장로'),
    submissions:new Set(rows.map(r=>r.receipt_code)).size,
  };
}
async function audit(env,authority,action,recordCount,now){
  await env.DB.prepare(`INSERT INTO ${AUDIT} (id,actor_email,actor_scope,action,record_count,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),String(authority.email||'').toLowerCase(),String(authority.scope||''),action,recordCount,new Date(now).toISOString()).run();
}
async function list(request,env,{now,resolveAuthority}){
  const authority=await resolveAuthority(request,env,{tenantSlug:MOKPO_POLICY_TENANT});
  if(!authority?.ok){
    const status=authority?.status===401?401:403;
    return fail(status===401?'ADMIN_LOGIN_REQUIRED':'ADMIN_FORBIDDEN',
      status===401?'목포노회 선교부 관리자 로그인이 필요합니다.':'목포노회 선교부 관리자 권한이 없습니다.',status);
  }
  if(!['platform','tenant','tenant-delegated'].includes(authority.scope))return fail('ADMIN_FORBIDDEN','목포노회 선교부 관리자 권한이 없습니다.',403);
  const keys=await mokpoMissionKeys(env.MOKPO_MISSION_PII_KEY);
  if(!keys)return fail('ENCRYPTION_UNAVAILABLE','복호화 설정을 확인할 수 없습니다.',503);
  const result=await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE expires_at>? ORDER BY created_at ASC, seq ASC LIMIT ${MAX_REGISTRATIONS}`).bind(new Date(now).toISOString()).all();
  const rows=result?.results||[];
  await audit(env,authority,'list',rows.length,now);
  let unreadable=0;
  const open=async(sealed,column,id)=>{try{return await openField(keys,sealed,column,id)}catch{unreadable++;return '[복호화 불가]'}};
  const registrations=[];
  for(const row of rows){
    registrations.push({receipt_id:row.receipt_code,created_at:row.created_at,dept:row.dept,role:row.role,
      name:await open(row.name_enc,'name',row.id),clergy:row.clergy,church:row.church,
      phone:await open(row.phone_enc,'phone',row.id),attend:row.attend});
  }
  if(unreadable)console.error('[mokpo-mission-policy-council-2026] unreadable sealed fields',unreadable);
  return json({ok:true,summary:summarize(rows),registrations,unreadable_fields:unreadable,
    viewer:{email:authority.email,scope:authority.scope},closes_at:new Date(REGISTRATION_CLOSES_AT).toISOString(),expires_at:EXPIRES_AT});
}

// ---------- entry ----------
export function isMokpoPolicyApiPath(pathname){return pathname===MOKPO_POLICY_API_PATH||pathname===MOKPO_POLICY_API_PATH+'/';}
export async function handleMokpoMissionPolicyRegistrations(request,env,options={}){
  const url=new URL(request.url);
  if(!isMokpoPolicyApiPath(url.pathname))return null;
  if(!env?.DB)return fail('STORAGE_UNAVAILABLE','접수 저장소를 사용할 수 없습니다.',503);
  const now=typeof options.now==='function'?options.now():Date.now();
  const resolveAuthority=options.resolveAuthority||resolveTenantAccessAuthority;
  try{
    if(request.method==='POST')return await submit(request,env,{now});
    if(request.method==='GET')return await list(request,env,{now,resolveAuthority});
    return fail('METHOD_NOT_ALLOWED','허용되지 않은 요청입니다.',405,{allow:'GET, POST'});
  }catch(error){
    console.error('[mokpo-mission-policy-council-2026] operation failed',error?.name||'Error');
    return fail('UNAVAILABLE','일시적인 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);
  }
}

// ---------- retention ----------
export async function purgeExpiredMokpoMissionRegistrations(env,{now=Date.now()}={}){
  if(!env?.DB)return {ok:false,reason:'db_unavailable',deleted:0};
  const result=await env.DB.prepare(`DELETE FROM ${TABLE} WHERE expires_at<=?`).bind(new Date(now).toISOString()).run();
  const deleted=Number(result?.meta?.changes||0);
  if(deleted)console.log('[mokpo-mission-policy-council-2026] retention purge removed rows',deleted);
  return {ok:true,deleted};
}
