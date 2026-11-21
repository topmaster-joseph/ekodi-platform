// EKODI-MEDIA-SHIELD-001 — 에코디 자체 DRM 모듈 (EKODI Media Shield)
//
// Two protection levels, chosen per content by its manifest:
//  1) software shield (default, free): media is packaged as AES-256-GCM encrypted fMP4
//     segments. A playback token (HMAC, short-lived, subject-bound) is required for every
//     manifest/segment read. The per-content key is derived (HKDF) from a master secret,
//     never stored, and delivered only wrapped to the viewer's ephemeral ECDH key; the
//     browser unwraps it straight into a non-extractable WebCrypto key. Every frame carries
//     a moving forensic watermark of the viewer. → stops downloading, hot-linking, URL
//     sharing and file copying. It does NOT stop OS screen recording (no software can).
//  2) hardware DRM (EME adapter): when a manifest declares `eme` (Widevine / PlayReady /
//     FairPlay key system + license URL from a licensed provider), the player hands the
//     CENC segments to the browser CDM. On L1/hardware-secure devices captures show black.
//     Using a CDM requires a license-server agreement (확인필요: provider/cost decision).

export const MEDIA_SHIELD_VERSION='v1';
export const MEDIA_SHIELD_API_PREFIX='/api/media-shield/';
export const MEDIA_SHIELD_PLAYER_PATH='/__ekodi/media-shield-player.js';
export const MEDIA_SHIELD_OBJECT_PREFIX='media-shield/';
const TOKEN_PREFIX='ms1';
const DEFAULT_TOKEN_TTL_SECONDS=180;
const MAX_TOKEN_TTL_SECONDS=900;
const CONTENT_ID=/^[a-z0-9][a-z0-9._-]{2,95}$/;
const SEGMENT_NAME=/^[a-z0-9][a-z0-9._-]{0,95}\.bin$/;
const encoder=new TextEncoder();
const decoder=new TextDecoder();

// ---------------------------------------------------------------- encoding helpers
export function b64url(bytes){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  let binary='';
  for(let i=0;i<view.length;i+=0x8000)binary+=String.fromCharCode(...view.subarray(i,i+0x8000));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function fromB64url(value){
  const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(text+'='.repeat((4-text.length%4)%4));
  const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}
function timingSafeEqual(a,b){
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
export function isValidContentId(value){return CONTENT_ID.test(String(value||''));}
function secretBytes(secret,name){
  const value=String(secret||'');
  if(value.length<32)throw new Error(`${name} must be at least 32 characters`);
  return encoder.encode(value);
}

// ---------------------------------------------------------------- keys
/** Per-content AES-256 key derived from the master secret (never stored anywhere). */
export async function deriveContentKeyBytes(masterSecret,contentId){
  if(!isValidContentId(contentId))throw new Error('invalid contentId');
  const base=await crypto.subtle.importKey('raw',secretBytes(masterSecret,'EKODI_MEDIA_SHIELD_MASTER_KEY'),'HKDF',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:encoder.encode('ekodi-media-shield/'+MEDIA_SHIELD_VERSION),info:encoder.encode('content:'+contentId)},base,256);
  return new Uint8Array(bits);
}
function segmentAad(contentId,segment){return encoder.encode(`ekodi-media-shield:${contentId}:${segment}`);}

/** Output layout: 12-byte IV || AES-GCM ciphertext+tag. AAD binds content and segment name. */
export async function encryptSegment(keyBytes,contentId,segment,plaintext){
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:segmentAad(contentId,segment)},key,plaintext));
  const out=new Uint8Array(12+cipher.length);
  out.set(iv,0);out.set(cipher,12);
  return out;
}
export async function decryptSegment(key,contentId,segment,payload){
  const bytes=payload instanceof Uint8Array?payload:new Uint8Array(payload);
  const cryptoKey=key instanceof CryptoKey?key:await crypto.subtle.importKey('raw',key,{name:'AES-GCM'},false,['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:segmentAad(contentId,segment)},cryptoKey,bytes.subarray(12)));
}

async function wrapKeyFromShared(privateKey,publicKey,salt){
  const shared=await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},privateKey,256);
  const hkdf=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:encoder.encode('ekodi-media-shield-wrap/'+MEDIA_SHIELD_VERSION)},hkdf,{name:'AES-GCM',length:256},false,['wrapKey','unwrapKey','encrypt','decrypt']);
}

/** Wraps the content key for a viewer's ephemeral P-256 public key (JWK). */
export async function wrapContentKey(keyBytes,viewerPublicJwk){
  if(!viewerPublicJwk||viewerPublicJwk.kty!=='EC'||viewerPublicJwk.crv!=='P-256'||viewerPublicJwk.d)throw new Error('invalid viewer public key');
  const viewer=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:viewerPublicJwk.x,y:viewerPublicJwk.y,ext:true},{name:'ECDH',namedCurve:'P-256'},false,[]);
  const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const wrapping=await wrapKeyFromShared(ephemeral.privateKey,viewer,salt);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const content=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},true,['decrypt']);
  const wrapped=await crypto.subtle.wrapKey('raw',content,wrapping,{name:'AES-GCM',iv});
  const epk=await crypto.subtle.exportKey('jwk',ephemeral.publicKey);
  return {alg:'ECDH-ES+HKDF-SHA256+A256GCM',epk:{kty:epk.kty,crv:epk.crv,x:epk.x,y:epk.y},salt:b64url(salt),iv:b64url(iv),wrapped:b64url(wrapped)};
}

/** Viewer side (also used by tests): unwraps directly into a non-extractable decrypt key. */
export async function unwrapContentKey(envelope,viewerPrivateKey){
  const server=await crypto.subtle.importKey('jwk',{...envelope.epk,ext:true},{name:'ECDH',namedCurve:'P-256'},false,[]);
  const wrapping=await wrapKeyFromShared(viewerPrivateKey,server,fromB64url(envelope.salt));
  return crypto.subtle.unwrapKey('raw',fromB64url(envelope.wrapped),wrapping,{name:'AES-GCM',iv:fromB64url(envelope.iv)},{name:'AES-GCM'},false,['decrypt']);
}

// ---------------------------------------------------------------- playback tokens
async function hmac(secret,data){
  const key=await crypto.subtle.importKey('raw',secretBytes(secret,'EKODI_MEDIA_SHIELD_TOKEN_SECRET'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(data)));
}

export async function issuePlaybackToken({contentId,subject,ttlSeconds=DEFAULT_TOKEN_TTL_SECONDS,now=Date.now()},secret){
  if(!isValidContentId(contentId))throw new Error('invalid contentId');
  const sub=String(subject||'').trim();
  if(!sub)throw new Error('subject required');
  const ttl=Math.max(30,Math.min(MAX_TOKEN_TTL_SECONDS,Number(ttlSeconds)||DEFAULT_TOKEN_TTL_SECONDS));
  const payload={v:MEDIA_SHIELD_VERSION,c:contentId,s:sub,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+ttl,n:b64url(crypto.getRandomValues(new Uint8Array(9)))};
  const body=b64url(encoder.encode(JSON.stringify(payload)));
  const signature=b64url(await hmac(secret,`${TOKEN_PREFIX}.${body}`));
  return {token:`${TOKEN_PREFIX}.${body}.${signature}`,expiresAt:payload.exp,nonce:payload.n};
}

export async function verifyPlaybackToken(token,secret,{contentId='',now=Date.now()}={}){
  const parts=String(token||'').split('.');
  if(parts.length!==3||parts[0]!==TOKEN_PREFIX)return {ok:false,reason:'MALFORMED'};
  let expected;
  try{expected=await hmac(secret,`${parts[0]}.${parts[1]}`);}catch{return {ok:false,reason:'NOT_CONFIGURED'};}
  let given;
  try{given=fromB64url(parts[2]);}catch{return {ok:false,reason:'MALFORMED'};}
  if(!timingSafeEqual(expected,given))return {ok:false,reason:'BAD_SIGNATURE'};
  let payload;
  try{payload=JSON.parse(decoder.decode(fromB64url(parts[1])));}catch{return {ok:false,reason:'MALFORMED'};}
  if(payload?.v!==MEDIA_SHIELD_VERSION||!isValidContentId(payload.c)||!payload.s)return {ok:false,reason:'MALFORMED'};
  if(Math.floor(now/1000)>=Number(payload.exp))return {ok:false,reason:'EXPIRED'};
  if(contentId&&payload.c!==contentId)return {ok:false,reason:'CONTENT_MISMATCH'};
  return {ok:true,payload};
}

export function maskSubject(subject){
  const value=String(subject||'');
  const email=value.match(/^([^@:]{1,64})@([^@]+)$/)||value.replace(/^[a-z]+:/i,'').match(/^([^@]{1,64})@([^@]+)$/);
  if(email)return `${email[1].slice(0,2)}***@${email[2]}`;
  return value.length>10?`${value.slice(0,4)}…${value.slice(-4)}`:value;
}

// ---------------------------------------------------------------- manifest & access
/**
 * Stored manifest (R2: media-shield/<contentId>/manifest.json), written by
 * tools/media-shield/package-media.mjs:
 * { version, contentId, title, mime, init:"init.bin", segments:["s00001.bin",…],
 *   audience:"members"|"subjects", subjects:["email@…"], eme?:{keySystem,licenseUrl} }
 */
export function publicManifestView(manifest){
  const view={version:manifest.version,contentId:manifest.contentId,title:String(manifest.title||''),mime:manifest.mime,init:manifest.init,segments:[...(manifest.segments||[])],duration:Number(manifest.duration)||null};
  if(Array.isArray(manifest.times)&&manifest.times.length===view.segments.length)view.times=manifest.times.map(Number);
  if(manifest.eme?.keySystem&&manifest.eme?.licenseUrl)view.eme={keySystem:String(manifest.eme.keySystem),licenseUrl:String(manifest.eme.licenseUrl)};
  return view;
}

export function subjectMayView(manifest,principal){
  if(!manifest||!principal)return false;
  if(ADMIN_ROLES.has(String(principal.role||'').toLowerCase()))return true;
  const audience=String(manifest.audience||'subjects');
  if(audience==='members')return true;
  const allowed=new Set((manifest.subjects||[]).map(v=>String(v).trim().toLowerCase()));
  return allowed.has(String(principal.email||'').toLowerCase())||allowed.has(String(principal.id||'').toLowerCase());
}

function shieldJson(body,status=200,extra={}){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store, max-age=0','x-ekodi-route':'media-shield','x-robots-tag':'noindex, nofollow, noarchive',...extra}});
}
function shieldError(code,status,message){return shieldJson({ok:false,code,error:message},status);}

async function loadManifest(bucket,contentId){
  if(!isValidContentId(contentId))return null;
  const object=await bucket.get(`${MEDIA_SHIELD_OBJECT_PREFIX}${contentId}/manifest.json`);
  if(!object)return null;
  const manifest=await object.json().catch(()=>null);
  if(!manifest||manifest.contentId!==contentId||!Array.isArray(manifest.segments))return null;
  return manifest;
}

const ADMIN_ROLES=new Set(['super_admin','admin']);
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIME=/^(?:video|audio)\/mp4; codecs="[a-zA-Z0-9., ]{3,120}"$/;
const PART_NAME=/^(?:init|s\d{5})\.bin$/;
const MAX_PART_BYTES=8*1024*1024;
const MAX_SEGMENTS=4000;

/**
 * EKODI login session (same validation the site boards use): the internal CONTROL_API
 * checks the real bearer session. A claimed email or header never grants access.
 */
export async function controlSessionPrincipal(request,env){
  if(!env?.CONTROL_API?.fetch)return null;
  const authorization=String(request.headers.get('authorization')||'');
  if(!/^Bearer [^\s]+$/.test(authorization)||authorization.length>8192)return null;
  const url=new URL(request.url);
  url.pathname='/api/session';url.search='';url.hash='';
  const response=await env.CONTROL_API.fetch(new Request(url.toString(),{method:'GET',headers:{authorization},redirect:'manual'})).catch(()=>null);
  if(!response?.ok)return null;
  const session=await response.json().catch(()=>null);
  const email=String(session?.email||'').trim().toLowerCase();
  if(session?.authenticated!==true||!EMAIL.test(email))return null;
  return Object.freeze({id:'session:'+email,email,role:String(session.role||'member').toLowerCase()});
}

function contentPrefix(contentId){return `${MEDIA_SHIELD_OBJECT_PREFIX}${contentId}/`;}
async function listKeys(bucket,prefix){
  const keys=[];let cursor;
  for(let page=0;page<20;page++){
    const listed=await bucket.list({prefix,cursor,limit:1000});
    for(const object of listed.objects||[])keys.push(object.key);
    if(!listed.truncated)break;
    cursor=listed.cursor;
  }
  return keys;
}
function newContentId(now=new Date()){
  const day=now.toISOString().slice(0,10).replace(/-/g,'');
  return `ms-${day}-${[...crypto.getRandomValues(new Uint8Array(4))].map(b=>b.toString(16).padStart(2,'0')).join('')}`;
}
function cleanTitle(value){return String(value||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,120);}
function cleanSubjects(value){
  const list=(Array.isArray(value)?value:String(value||'').split(/[\s,;]+/)).map(v=>String(v).trim().toLowerCase()).filter(Boolean);
  return [...new Set(list)].filter(v=>EMAIL.test(v)).slice(0,500);
}

async function handleMediaShieldAdmin(request,env,{bucket,masterKey,rest,method,resolveAdmin}){
  const admin=await resolveAdmin(request,env).catch(()=>null);
  if(!admin?.email)return shieldError('AUTH_REQUIRED',401,'에코디 관리자 로그인이 필요합니다.');
  if(!ADMIN_ROLES.has(String(admin.role||'').toLowerCase()))return shieldError('ADMIN_REQUIRED',403,'관리자만 사용할 수 있습니다.');
  const action=rest[1]||'';
  const contentId=String(rest[2]||'').toLowerCase();

  if(action==='list'&&method==='GET'){
    const listed=await bucket.list({prefix:MEDIA_SHIELD_OBJECT_PREFIX,delimiter:'/',limit:200});
    const ids=(listed.delimitedPrefixes||[]).map(v=>v.slice(MEDIA_SHIELD_OBJECT_PREFIX.length).replace(/\/$/,'')).filter(isValidContentId).sort().reverse().slice(0,60);
    const items=[];
    for(const id of ids){
      const manifest=await loadManifest(bucket,id);
      items.push(manifest?{contentId:id,status:'published',title:manifest.title||id,audience:manifest.audience,subjects:(manifest.subjects||[]).length,duration:Number(manifest.duration)||null,segments:manifest.segments.length,publishedAt:manifest.publishedAt||manifest.packagedAt||null}:{contentId:id,status:'draft',title:id});
    }
    return shieldJson({ok:true,items});
  }
  if(action==='new'&&method==='POST'){
    return shieldJson({ok:true,contentId:newContentId()});
  }
  if(!isValidContentId(contentId))return shieldError('INVALID_CONTENT',400,'영상 식별자가 올바르지 않습니다.');
  const published=await loadManifest(bucket,contentId);

  if(action==='key'&&method==='POST'){
    if(published)return shieldError('ALREADY_PUBLISHED',409,'이미 공개된 영상은 다시 암호화할 수 없습니다.');
    const body=await request.json().catch(()=>({}));
    let envelope;
    try{envelope=await wrapContentKey(await deriveContentKeyBytes(masterKey,contentId),body?.publicKey);}
    catch{return shieldError('INVALID_VIEWER_KEY',400,'브라우저 키가 올바르지 않습니다.');}
    console.info('EKODI media shield packaging key',{contentId,admin:maskSubject(admin.email)});
    return shieldJson({ok:true,envelope});
  }
  if(action==='part'&&method==='PUT'){
    if(published)return shieldError('ALREADY_PUBLISHED',409,'이미 공개된 영상은 수정할 수 없습니다.');
    const name=String(rest[3]||'');
    if(!PART_NAME.test(name))return shieldError('INVALID_PART',400,'영상 조각 이름이 올바르지 않습니다.');
    const declared=request.headers.get('content-length');
    const length=Number(declared||0);
    if(declared!==null&&(!Number.isFinite(length)||length<29||length>MAX_PART_BYTES))return shieldError('INVALID_PART_SIZE',413,'영상 조각 크기가 허용 범위를 벗어났습니다.');
    // Without a declared length the body is buffered (bounded) so R2 always receives a known size.
    const body=declared!==null&&request.body?request.body:new Uint8Array(await request.arrayBuffer());
    if(body instanceof Uint8Array&&(body.byteLength<29||body.byteLength>MAX_PART_BYTES))return shieldError('INVALID_PART_SIZE',413,'영상 조각 크기가 허용 범위를 벗어났습니다.');
    await bucket.put(contentPrefix(contentId)+name,body,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{uploadedBy:maskSubject(admin.email)}});
    return shieldJson({ok:true,name});
  }
  if(action==='publish'&&method==='POST'){
    if(published)return shieldError('ALREADY_PUBLISHED',409,'이미 공개된 영상입니다.');
    const body=await request.json().catch(()=>({}));
    const title=cleanTitle(body?.title)||contentId;
    const mime=String(body?.mime||'');
    const times=Array.isArray(body?.times)?body.times.map(Number):[];
    const duration=Number(body?.duration);
    const audience=body?.audience==='members'?'members':'subjects';
    const subjects=cleanSubjects(body?.subjects);
    if(!MIME.test(mime))return shieldError('INVALID_MIME',400,'영상 형식 정보가 올바르지 않습니다.');
    if(!times.length||times.length>MAX_SEGMENTS||times.some((t,i)=>!Number.isFinite(t)||t<0||(i&&t<times[i-1])))return shieldError('INVALID_TIMES',400,'영상 조각 시간 정보가 올바르지 않습니다.');
    if(!Number.isFinite(duration)||duration<=0||duration>12*3600)return shieldError('INVALID_DURATION',400,'영상 길이가 올바르지 않습니다.');
    if(audience==='subjects'&&!subjects.length)return shieldError('SUBJECTS_REQUIRED',400,'볼 수 있는 사람의 이메일을 한 개 이상 입력해 주세요.');
    const segments=times.map((_,i)=>`s${String(i+1).padStart(5,'0')}.bin`);
    const stored=new Set((await listKeys(bucket,contentPrefix(contentId))).map(key=>key.slice(contentPrefix(contentId).length)));
    const missing=['init.bin',...segments].filter(name=>!stored.has(name));
    if(missing.length)return shieldError('PARTS_MISSING',409,`업로드되지 않은 조각이 있습니다: ${missing.slice(0,5).join(', ')}${missing.length>5?' 외':''}`);
    const manifest={version:MEDIA_SHIELD_VERSION,contentId,title,mime,init:'init.bin',segments,times,duration,audience,subjects,publishedBy:maskSubject(admin.email),publishedAt:new Date().toISOString()};
    await bucket.put(contentPrefix(contentId)+'manifest.json',JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}});
    console.info('EKODI media shield published',{contentId,segments:segments.length,audience,admin:maskSubject(admin.email)});
    return shieldJson({ok:true,contentId,watchPath:`/my/media/${contentId}`});
  }
  if(action==='content'&&method==='DELETE'){
    const keys=await listKeys(bucket,contentPrefix(contentId));
    for(let i=0;i<keys.length;i+=1000)await bucket.delete(keys.slice(i,i+1000));
    console.info('EKODI media shield deleted',{contentId,objects:keys.length,admin:maskSubject(admin.email)});
    return shieldJson({ok:true,deleted:keys.length});
  }
  return shieldError('NOT_FOUND',404,'알 수 없는 관리자 요청입니다.');
}

export function isMediaShieldPath(pathname=''){return String(pathname||'').startsWith(MEDIA_SHIELD_API_PREFIX);}

/**
 * Routes:
 *  POST /api/media-shield/token     {contentId}              (Bearer EKODI login) → playback token
 *  POST /api/media-shield/key       {token, publicKey(JWK)}                       → wrapped key + watermark
 *  GET  /api/media-shield/manifest/<contentId>?t=<token>                          → public manifest
 *  GET  /api/media-shield/segment/<contentId>/<name>.bin?t=<token>                → encrypted segment
 * `resolvePrincipal(request,env)` returns {id,email} for a signed-in viewer or null.
 */
export async function handleMediaShieldRequest(request,env={},{resolvePrincipal,resolveAdmin}={}){
  const viewer=async(req,environment)=>(await controlSessionPrincipal(req,environment).catch(()=>null))||(typeof resolvePrincipal==='function'?await resolvePrincipal(req,environment).catch(()=>null):null);
  const adminResolver=typeof resolveAdmin==='function'?resolveAdmin:controlSessionPrincipal;
  const url=new URL(request.url);
  const method=String(request.method||'GET').toUpperCase();
  const rest=url.pathname.slice(MEDIA_SHIELD_API_PREFIX.length).split('/').filter(Boolean);
  const bucket=env.MEDIA_SHIELD_BUCKET;
  const tokenSecret=env.EKODI_MEDIA_SHIELD_TOKEN_SECRET;
  const masterKey=env.EKODI_MEDIA_SHIELD_MASTER_KEY;
  if(!bucket?.get||String(tokenSecret||'').length<32||String(masterKey||'').length<32){
    return shieldError('MEDIA_SHIELD_NOT_CONFIGURED',503,'보호 영상 서비스가 아직 설정되지 않았습니다.');
  }
  const action=rest[0]||'';
  if(action==='admin')return handleMediaShieldAdmin(request,env,{bucket,masterKey,rest,method,resolveAdmin:adminResolver});

  if(action==='token'){
    if(method!=='POST')return shieldError('METHOD_NOT_ALLOWED',405,'허용되지 않은 요청입니다.');
    const principal=await viewer(request,env);
    if(!principal?.email)return shieldError('AUTH_REQUIRED',401,'로그인이 필요합니다.');
    const body=await request.json().catch(()=>({}));
    const contentId=String(body?.contentId||'').trim().toLowerCase();
    const manifest=await loadManifest(bucket,contentId);
    if(!manifest)return shieldError('CONTENT_NOT_FOUND',404,'영상을 찾을 수 없습니다.');
    if(!subjectMayView(manifest,principal))return shieldError('CONTENT_FORBIDDEN',403,'이 영상을 볼 권한이 없습니다.');
    const issued=await issuePlaybackToken({contentId,subject:String(principal.email).toLowerCase()},tokenSecret);
    console.info('EKODI media shield token',{contentId,subject:maskSubject(principal.email),nonce:issued.nonce});
    return shieldJson({ok:true,...issued});
  }

  if(action==='key'){
    if(method!=='POST')return shieldError('METHOD_NOT_ALLOWED',405,'허용되지 않은 요청입니다.');
    const body=await request.json().catch(()=>({}));
    const verified=await verifyPlaybackToken(body?.token,tokenSecret);
    if(!verified.ok)return shieldError('TOKEN_'+verified.reason,401,'재생 권한이 만료되었거나 올바르지 않습니다.');
    const manifest=await loadManifest(bucket,verified.payload.c);
    if(!manifest)return shieldError('CONTENT_NOT_FOUND',404,'영상을 찾을 수 없습니다.');
    if(manifest.eme)return shieldError('HARDWARE_DRM_CONTENT',409,'이 영상은 하드웨어 DRM 라이선스 서버로 재생됩니다.');
    let envelope;
    try{envelope=await wrapContentKey(await deriveContentKeyBytes(masterKey,verified.payload.c),body?.publicKey);}
    catch{return shieldError('INVALID_VIEWER_KEY',400,'재생 장치 키가 올바르지 않습니다.');}
    const watermark=`EKODI ${maskSubject(verified.payload.s)} ${verified.payload.n}`;
    console.info('EKODI media shield key',{contentId:verified.payload.c,subject:maskSubject(verified.payload.s),nonce:verified.payload.n});
    return shieldJson({ok:true,envelope,watermark});
  }

  if(action==='manifest'||action==='segment'){
    if(method!=='GET'&&method!=='HEAD')return shieldError('METHOD_NOT_ALLOWED',405,'허용되지 않은 요청입니다.');
    const contentId=String(rest[1]||'').toLowerCase();
    const verified=await verifyPlaybackToken(url.searchParams.get('t'),tokenSecret,{contentId});
    if(!verified.ok)return shieldError('TOKEN_'+verified.reason,401,'재생 권한이 만료되었거나 올바르지 않습니다.');
    const manifest=await loadManifest(bucket,contentId);
    if(!manifest)return shieldError('CONTENT_NOT_FOUND',404,'영상을 찾을 수 없습니다.');
    if(action==='manifest')return shieldJson({ok:true,manifest:publicManifestView(manifest)});
    const name=String(rest[2]||'');
    if(!SEGMENT_NAME.test(name)||(name!==manifest.init&&!manifest.segments.includes(name)))return shieldError('SEGMENT_NOT_FOUND',404,'영상 조각을 찾을 수 없습니다.');
    const object=await bucket.get(`${MEDIA_SHIELD_OBJECT_PREFIX}${contentId}/${name}`);
    if(!object)return shieldError('SEGMENT_NOT_FOUND',404,'영상 조각을 찾을 수 없습니다.');
    return new Response(method==='HEAD'?null:object.body,{status:200,headers:{'content-type':'application/octet-stream','cache-control':'private, no-store, max-age=0','x-content-type-options':'nosniff','x-ekodi-route':'media-shield-segment','content-disposition':'inline'}});
  }

  return shieldError('NOT_FOUND',404,'알 수 없는 요청입니다.');
}

// ---------------------------------------------------------------- viewer (served as text)
// Plain string on purpose: bundlers (wrangler keep_names) inject helpers such as __name()
// into function bodies, so Function.prototype.toString() would ship code that cannot run in a browser.
const MEDIA_SHIELD_PLAYER_CLIENT_SOURCE=String.raw`function mediaShieldPlayerClient(){
  'use strict';
  var API='/api/media-shield/';
  var AHEAD=45,BEHIND=30;
  var te=new TextEncoder();
  function b64(value){var t=String(value).replace(/-/g,'+').replace(/_/g,'/');var s=atob(t+'='.repeat((4-t.length%4)%4));var o=new Uint8Array(s.length);for(var i=0;i<s.length;i++)o[i]=s.charCodeAt(i);return o;}
  function aad(contentId,segment){return te.encode('ekodi-media-shield:'+contentId+':'+segment);}
  function storedAuth(){
    try{
      var t=sessionStorage.getItem('ekodi-auth-token')||localStorage.getItem('ekodi-auth-token');
      if(t)return t;
      for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(/^sb-.*-auth-token$/.test(k)){var j=JSON.parse(localStorage.getItem(k)||'null');if(j&&j.access_token)return j.access_token;}}
    }catch(e){}
    return '';
  }
  function fail(r,j){var e=new Error((j&&j.error)||'보호 영상 오류');e.code=j&&j.code;e.status=r.status;return e;}
  function post(path,body,auth){
    var headers={'content-type':'application/json'};
    if(auth)headers.authorization='Bearer '+auth;
    return fetch(API+path,{method:'POST',headers:headers,body:JSON.stringify(body),credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok||!j.ok)throw fail(r,j);return j;});});
  }
  function overlay(video,text){
    var host=video.parentElement;
    if(getComputedStyle(host).position==='static')host.style.position='relative';
    var mark=document.createElement('div');
    mark.setAttribute('aria-hidden','true');
    mark.textContent=text;
    mark.style.cssText='position:absolute;pointer-events:none;z-index:5;font:600 13px/1.2 sans-serif;color:rgba(255,255,255,.38);text-shadow:0 0 2px rgba(0,0,0,.55);white-space:nowrap;transition:top 1.2s,left 1.2s';
    host.appendChild(mark);
    function move(){mark.style.top=(8+Math.random()*78)+'%';mark.style.left=(4+Math.random()*60)+'%';}
    move();
    var timer=setInterval(function(){if(!mark.isConnected)host.appendChild(mark);move();},7000);
    return function(){clearInterval(timer);mark.remove();};
  }
  function harden(video){
    video.setAttribute('controlsList','nodownload noremoteplayback');
    video.disablePictureInPicture=true;
    video.disableRemotePlayback=true;
    video.addEventListener('contextmenu',function(e){e.preventDefault();});
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')video.pause();});
    window.addEventListener('blur',function(){if(document.activeElement!==video)video.pause();});
  }
  function emePlay(video,manifest,state){
    var config=[{initDataTypes:['cenc'],videoCapabilities:[{contentType:manifest.mime,robustness:'HW_SECURE_ALL'}]},{initDataTypes:['cenc'],videoCapabilities:[{contentType:manifest.mime}]}];
    return navigator.requestMediaKeySystemAccess(manifest.eme.keySystem,config).then(function(access){return access.createMediaKeys();}).then(function(keys){
      video.addEventListener('encrypted',function(event){
        var session=keys.createSession();
        session.addEventListener('message',function(message){
          fetch(manifest.eme.licenseUrl,{method:'POST',headers:{'x-ekodi-playback-token':state.token},body:message.message}).then(function(r){return r.arrayBuffer();}).then(function(license){return session.update(license);});
        });
        session.generateRequest(event.initDataType,event.initData);
      });
      return video.setMediaKeys(keys);
    });
  }
  function unwrapKey(state,pair){
    return crypto.subtle.exportKey('jwk',pair.publicKey).then(function(pub){return post('key',{token:state.token,publicKey:{kty:pub.kty,crv:pub.crv,x:pub.x,y:pub.y}});}).then(function(res){
      var env=res.envelope;
      state.watermark=res.watermark;
      return crypto.subtle.importKey('jwk',Object.assign({},env.epk,{ext:true}),{name:'ECDH',namedCurve:'P-256'},false,[]).then(function(server){
        return crypto.subtle.deriveBits({name:'ECDH',public:server},pair.privateKey,256);
      }).then(function(shared){return crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);}).then(function(hkdf){
        return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:b64(env.salt),info:te.encode('ekodi-media-shield-wrap/v1')},hkdf,{name:'AES-GCM',length:256},false,['unwrapKey']);
      }).then(function(wrapping){
        return crypto.subtle.unwrapKey('raw',b64(env.wrapped),wrapping,{name:'AES-GCM',iv:b64(env.iv)},{name:'AES-GCM'},false,['decrypt']);
      });
    });
  }
  function mount(video,options){
    options=options||{};
    var contentId=String(options.contentId||video.getAttribute('data-ekodi-media')||'').toLowerCase();
    var authFor=function(){return (typeof options.getAuthToken==='function'?options.getAuthToken():options.authToken)||storedAuth();};
    var state={token:'',expiresAt:0,watermark:''};
    var stop=function(){};
    harden(video);
    function refresh(){return post('token',{contentId:contentId},authFor()).then(function(j){state.token=j.token;state.expiresAt=j.expiresAt;return j;});}
    function fresh(){return Date.now()/1000<state.expiresAt-20?Promise.resolve():refresh();}
    function get(path){
      return fresh().then(function(){return fetch(API+path+'?t='+encodeURIComponent(state.token),{credentials:'same-origin',cache:'no-store'});}).then(function(r){
        if(r.status!==401)return r;
        state.expiresAt=0;
        return fresh().then(function(){return fetch(API+path+'?t='+encodeURIComponent(state.token),{credentials:'same-origin',cache:'no-store'});});
      });
    }
    return refresh().then(function(){return get('manifest/'+contentId);}).then(function(r){return r.json().then(function(j){if(!r.ok||!j.ok)throw fail(r,j);return j.manifest;});}).then(function(manifest){
      var hardware=Boolean(manifest.eme&&navigator.requestMediaKeySystemAccess);
      var keyPromise=hardware?emePlay(video,manifest,state).then(function(){return null;}):crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']).then(function(pair){return unwrapKey(state,pair);});
      return keyPromise.then(function(key){
        if(state.watermark)stop=overlay(video,state.watermark);
        // iPhone Safari exposes only ManagedMediaSource (iOS 17.1+); it needs disableRemotePlayback (set in harden).
        var MS=window.MediaSource||window.ManagedMediaSource;
        if(!MS||!MS.isTypeSupported(manifest.mime)){var e=new Error('이 브라우저는 이 영상 형식을 재생할 수 없습니다.');e.code='UNSUPPORTED_FORMAT';throw e;}
        var names=manifest.segments,times=manifest.times||null;
        var source=new MS();
        video.src=URL.createObjectURL(source);
        return new Promise(function(resolve,reject){
          source.addEventListener('sourceopen',function(){
            URL.revokeObjectURL(video.src);
            var buffer=source.addSourceBuffer(manifest.mime);
            if(manifest.duration)try{source.duration=manifest.duration;}catch(e){}
            var index=0,busy=false,done=false,wake=null;
            function fetchPart(name){
              return get('segment/'+contentId+'/'+name).then(function(r){if(!r.ok)throw new Error('segment '+name);return r.arrayBuffer();}).then(function(payload){
                if(!key)return payload;
                var bytes=new Uint8Array(payload);
                return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:aad(contentId,name)},key,bytes.subarray(12));
              });
            }
            function waitUpdate(){return new Promise(function(ok,no){buffer.addEventListener('updateend',ok,{once:true});buffer.addEventListener('error',no,{once:true});});}
            function append(bytes,retried){
              try{buffer.appendBuffer(bytes);return waitUpdate();}
              catch(error){
                if(error&&error.name==='QuotaExceededError'&&!retried&&video.currentTime>BEHIND/2){buffer.remove(0,Math.max(0,video.currentTime-BEHIND/2));return waitUpdate().then(function(){return append(bytes,true);});}
                return Promise.reject(error);
              }
            }
            function trim(){
              if(buffer.updating||!buffer.buffered.length)return Promise.resolve();
              var start=buffer.buffered.start(0),cut=video.currentTime-BEHIND;
              if(cut-start>5){buffer.remove(start,cut);return waitUpdate();}
              return Promise.resolve();
            }
            function indexAt(t){if(!times)return index;var lo=0;for(var i=0;i<times.length;i++){if(times[i]<=t)lo=i;else break;}return lo;}
            function nextDue(){return index<names.length&&(!times||times[index]<video.currentTime+AHEAD);}
            function pump(){
              if(busy||done)return;
              if(index>=names.length){done=true;if(source.readyState==='open'&&!buffer.updating)try{source.endOfStream();}catch(e){}resolve();return;}
              if(!nextDue())return;
              busy=true;
              var name=names[index++];
              trim().then(function(){return fetchPart(name);}).then(function(bytes){return append(bytes);}).then(function(){busy=false;if(index===1)resolve();pump();},function(error){busy=false;video.setAttribute('data-ekodi-media-error',error&&error.code||error&&error.message||'error');reject(error);});
            }
            video.addEventListener('timeupdate',pump);
            video.addEventListener('seeking',function(){if(!times)return;var target=indexAt(video.currentTime);if(target<index-1||target>index){index=target;done=false;}pump();});
            fetchPart(manifest.init).then(function(bytes){return append(bytes);}).then(pump,reject);
          },{once:true});
        });
      });
    }).then(function(){return {stop:function(){stop();}};});
  }
  window.EkodiMediaShield={version:'v1',mount:mount,storedAuth:storedAuth};
  document.querySelectorAll('video[data-ekodi-media][data-ekodi-media-autoload]').forEach(function(video){mount(video).catch(function(error){video.setAttribute('data-ekodi-media-error',error.code||error.message);});});
}`;

export const MEDIA_SHIELD_PLAYER_SCRIPT=`/* EKODI Media Shield player ${MEDIA_SHIELD_VERSION} */(${MEDIA_SHIELD_PLAYER_CLIENT_SOURCE})();`;

export function mediaShieldPlayerResponse(request){
  const method=String(request.method||'GET').toUpperCase();
  if(method!=='GET'&&method!=='HEAD')return null;
  if(new URL(request.url).pathname!==MEDIA_SHIELD_PLAYER_PATH)return null;
  return new Response(method==='HEAD'?null:MEDIA_SHIELD_PLAYER_SCRIPT,{status:200,headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=600','x-content-type-options':'nosniff','x-ekodi-route':'media-shield-player'}});
}
