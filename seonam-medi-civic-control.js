import authWorker from './auth-worker.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessGrantIsActive } from './access-governance.js';

const VOICES_PATH='/api/seonam-medi/voices';
const CONTENT_PATH='/api/seonam-medi/content';
const ADMIN_PREFIX='/api/seonam-medi/admin';
const TENANT_SLUG='seonam-medi';
const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
const BOARD_CAP='seonam.board.manage';
const CHANNEL_CAP='seonam.channel.manage';
const MANAGEMENT_ROLES=new Set(['owner','admin','tenant_admin','workspace_admin','client_admin']);
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const normalize=value=>String(value||'').trim().toLowerCase();
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extra}});
const parseCaps=value=>{try{const list=JSON.parse(String(value||'[]'));return Array.isArray(list)?list.map(normalize).filter(Boolean):[]}catch{return[]}};
const safeHttps=value=>{try{const url=new URL(String(value||''));return url.protocol==='https:'&&!url.username&&!url.password?url.href:''}catch{return''}};

async function fingerprint(request){
  const ip=clean(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',128);
  const bytes=new TextEncoder().encode(ip);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

async function ensureSchema(db){
  await db.exec(`CREATE TABLE IF NOT EXISTS seonam_med_civic_voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    public_consent INTEGER NOT NULL DEFAULT 0,
    privacy_consent INTEGER NOT NULL DEFAULT 1,
    review_status TEXT NOT NULL DEFAULT 'received',
    request_fingerprint TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonam_med_civic_voices_created ON seonam_med_civic_voices(created_at);
  CREATE INDEX IF NOT EXISTS idx_seonam_med_civic_voices_review ON seonam_med_civic_voices(review_status,created_at);

  CREATE TABLE IF NOT EXISTS seonam_med_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 1,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_seonam_med_notices_public ON seonam_med_notices(published,pinned,created_at);

  CREATE TABLE IF NOT EXISTS seonam_med_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'related',
    official INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_seonam_med_channels_public ON seonam_med_channels(visible,sort_order,id);

  CREATE TABLE IF NOT EXISTS seonam_med_content_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );`);
}

async function adminSession(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const session=await response.json().catch(()=>null);
  return session?.authenticated&&session?.email?session:null;
}

async function editorAuthority(request,env){
  const session=await adminSession(request,env);
  if(session?.role==='super_admin')return {ok:true,email:normalize(session.email),role:'super_admin',platform:true,capabilities:['*']};
  const principal=await principalFromSupabaseRequest(request);
  if(!principal?.email)return {ok:false,status:401,code:'AUTH_REQUIRED'};
  await ensureSchema(env.DB);
  const tenant=await env.DB.prepare('SELECT id,status FROM customer_tenants WHERE slug=? LIMIT 1').bind(TENANT_SLUG).first();
  if(!tenant||tenant.status!=='active')return {ok:false,status:404,code:'TENANT_NOT_FOUND'};
  const email=normalize(principal.email);
  const grant=await env.DB.prepare(`SELECT role,enabled,capabilities_json,denied_capabilities_json,expires_at
    FROM customer_access_grants WHERE tenant_id=? AND lower(trim(email))=? LIMIT 1`).bind(tenant.id,email).first();
  if(!accessGrantIsActive(grant))return {ok:false,status:403,code:'ACCESS_FORBIDDEN'};
  const denied=new Set(parseCaps(grant.denied_capabilities_json));
  const explicit=parseCaps(grant.capabilities_json).filter(cap=>!denied.has(cap));
  const role=normalize(grant.role);
  const capabilities=MANAGEMENT_ROLES.has(role)?['*']:explicit;
  if(!capabilities.includes('*')&&!capabilities.includes(BOARD_CAP)&&!capabilities.includes(CHANNEL_CAP))return {ok:false,status:403,code:'ACCESS_FORBIDDEN'};
  return {ok:true,email,role,platform:false,capabilities};
}

const can=(authority,cap)=>authority?.ok&&(authority.capabilities.includes('*')||authority.capabilities.includes(cap));
async function audit(env,authority,action,type,id,detail={}){
  await env.DB.prepare('INSERT INTO seonam_med_content_audit(actor_email,action,resource_type,resource_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .bind(authority.email,action,type,id||null,JSON.stringify(detail).slice(0,4000),new Date().toISOString()).run();
}
function publicNotice(row){return{id:Number(row.id),title:row.title,body:row.body,pinned:Boolean(row.pinned),createdAt:row.created_at,updatedAt:row.updated_at}}
function publicChannel(row){return{id:Number(row.id),platform:row.platform,label:row.label,url:row.url,category:row.category,official:Boolean(row.official),sortOrder:Number(row.sort_order||100)}}

async function publicContent(request,env){
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
  await ensureSchema(env.DB);
  const [notices,channels]=await Promise.all([
    env.DB.prepare('SELECT id,title,body,pinned,created_at,updated_at FROM seonam_med_notices WHERE published=1 ORDER BY pinned DESC, created_at DESC, id DESC LIMIT 30').all(),
    env.DB.prepare('SELECT id,platform,label,url,category,official,sort_order FROM seonam_med_channels WHERE visible=1 ORDER BY sort_order ASC,id ASC LIMIT 60').all(),
  ]);
  return json({ok:true,notices:(notices.results||[]).map(publicNotice),channels:(channels.results||[]).map(publicChannel),organization:{status:'planned',message:'조직 구성은 추후 공개 예정입니다.'}});
}

async function adminApi(request,env,url){
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
  await ensureSchema(env.DB);
  const authority=await editorAuthority(request,env);
  if(!authority.ok)return json({ok:false,error:authority.code},authority.status||403);
  const suffix=url.pathname.slice(ADMIN_PREFIX.length).replace(/^\/+|\/+$/g,'');
  if(suffix==='me'&&request.method==='GET')return json({ok:true,email:authority.email,role:authority.role,platform:authority.platform,capabilities:authority.capabilities,canManageNotices:can(authority,BOARD_CAP),canManageChannels:can(authority,CHANNEL_CAP)});

  const noticeMatch=suffix.match(/^notices(?:\/(\d+))?$/);
  if(noticeMatch){
    if(!can(authority,BOARD_CAP))return json({ok:false,error:'NOTICE_MANAGE_FORBIDDEN'},403);
    const id=Number(noticeMatch[1]||0);
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,title,body,published,pinned,created_at,updated_at,updated_by FROM seonam_med_notices ORDER BY pinned DESC,created_at DESC,id DESC').all();
      return json({ok:true,items:rows.results||[]});
    }
    if(request.method==='POST'||request.method==='PUT'){
      let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
      const title=clean(body?.title,160),content=clean(body?.body,8000),published=body?.published===false?0:1,pinned=body?.pinned===true?1:0;
      if(!title)return json({ok:false,error:'title_required'},400);
      const now=new Date().toISOString();
      if(request.method==='POST'){
        const result=await env.DB.prepare('INSERT INTO seonam_med_notices(title,body,published,pinned,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?)').bind(title,content,published,pinned,now,now,authority.email).run();
        const newId=Number(result?.meta?.last_row_id||0);await audit(env,authority,'notice.create','notice',newId,{title,published:Boolean(published),pinned:Boolean(pinned)});
        return json({ok:true,id:newId},201);
      }
      if(!id)return json({ok:false,error:'id_required'},400);
      await env.DB.prepare('UPDATE seonam_med_notices SET title=?,body=?,published=?,pinned=?,updated_at=?,updated_by=? WHERE id=?').bind(title,content,published,pinned,now,authority.email,id).run();
      await audit(env,authority,'notice.update','notice',id,{title,published:Boolean(published),pinned:Boolean(pinned)});return json({ok:true,id});
    }
    if(request.method==='DELETE'){
      if(!id)return json({ok:false,error:'id_required'},400);
      await env.DB.prepare('DELETE FROM seonam_med_notices WHERE id=?').bind(id).run();await audit(env,authority,'notice.delete','notice',id);return json({ok:true,id});
    }
    return json({ok:false,error:'method_not_allowed'},405);
  }

  const channelMatch=suffix.match(/^channels(?:\/(\d+))?$/);
  if(channelMatch){
    if(!can(authority,CHANNEL_CAP))return json({ok:false,error:'CHANNEL_MANAGE_FORBIDDEN'},403);
    const id=Number(channelMatch[1]||0);
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,platform,label,url,category,official,visible,sort_order,created_at,updated_at,updated_by FROM seonam_med_channels ORDER BY sort_order ASC,id ASC').all();
      return json({ok:true,items:rows.results||[]});
    }
    if(request.method==='POST'||request.method==='PUT'){
      let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
      const platform=clean(body?.platform,40)||'other',label=clean(body?.label,120),href=safeHttps(body?.url),category=clean(body?.category,40)||'related',official=body?.official===true?1:0,visible=body?.visible===false?0:1,sortOrder=Math.max(0,Math.min(9999,Number.parseInt(body?.sortOrder,10)||100));
      if(!label||!href)return json({ok:false,error:'channel_fields_required'},400);
      const now=new Date().toISOString();
      if(request.method==='POST'){
        const result=await env.DB.prepare('INSERT INTO seonam_med_channels(platform,label,url,category,official,visible,sort_order,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(platform,label,href,category,official,visible,sortOrder,now,now,authority.email).run();
        const newId=Number(result?.meta?.last_row_id||0);await audit(env,authority,'channel.create','channel',newId,{platform,label,url:href,category,official:Boolean(official),visible:Boolean(visible)});return json({ok:true,id:newId},201);
      }
      if(!id)return json({ok:false,error:'id_required'},400);
      await env.DB.prepare('UPDATE seonam_med_channels SET platform=?,label=?,url=?,category=?,official=?,visible=?,sort_order=?,updated_at=?,updated_by=? WHERE id=?').bind(platform,label,href,category,official,visible,sortOrder,now,authority.email,id).run();
      await audit(env,authority,'channel.update','channel',id,{platform,label,url:href,category,official:Boolean(official),visible:Boolean(visible)});return json({ok:true,id});
    }
    if(request.method==='DELETE'){
      if(!id)return json({ok:false,error:'id_required'},400);
      await env.DB.prepare('DELETE FROM seonam_med_channels WHERE id=?').bind(id).run();await audit(env,authority,'channel.delete','channel',id);return json({ok:true,id});
    }
    return json({ok:false,error:'method_not_allowed'},405);
  }
  return json({ok:false,error:'not_found'},404);
}

async function voiceApi(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'POST, OPTIONS','cache-control':'no-store'}});
  if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  if(env?.ENVIRONMENT==='production'&&request.headers.get('origin')!=='https://ekodi.kr')return json({ok:false,error:'origin_not_allowed'},403);
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable',message:'의견 접수 저장소를 사용할 수 없습니다.'},503);
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>16384)return json({ok:false,error:'payload_too_large'},413);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  if(clean(body?.website,200))return json({ok:true,message:'의견이 접수되었습니다.'});
  const category=clean(body?.category||'other',24).toLowerCase();
  const displayName=clean(body?.name,80);
  const contact=clean(body?.contact,160);
  const message=clean(body?.message,3000);
  const publicConsent=body?.publicConsent===true?1:0;
  if(!CATEGORIES.has(category))return json({ok:false,error:'invalid_category',message:'의견 유형을 확인해 주세요.'},400);
  if(!message)return json({ok:false,error:'invalid_message',message:'의견 내용을 입력해 주세요.'},400);
  if(body?.privacyConsent!==true)return json({ok:false,error:'privacy_consent_required',message:'개인정보 처리 동의가 필요합니다.'},400);
  await ensureSchema(env.DB);
  const requestFingerprint=await fingerprint(request);
  const recent=await env.DB.prepare(`SELECT count(*) AS count FROM seonam_med_civic_voices WHERE request_fingerprint=? AND unixepoch(created_at)>=unixepoch('now')-3600`).bind(requestFingerprint).first();
  if(Number(recent?.count||0)>=8)return json({ok:false,error:'rate_limited',message:'잠시 후 다시 접수해 주세요.'},429);
  const now=new Date().toISOString();
  const result=await env.DB.prepare(`INSERT INTO seonam_med_civic_voices
    (category,display_name,contact,message,public_consent,privacy_consent,review_status,request_fingerprint,created_at,updated_at)
    VALUES (?,?,?,?,?,1,'received',?,?,?)`)
    .bind(category,displayName,contact,message,publicConsent,requestFingerprint,now,now).run();
  return json({ok:true,submissionId:result?.meta?.last_row_id||null,message:'의견이 접수되었습니다. 검토 후 필요한 경우 답변하거나 공개합니다.'});
}

export async function handleSeonamMediCivicApi(request,env){
  const url=new URL(request.url);
  if(url.pathname===VOICES_PATH)return voiceApi(request,env);
  if(url.pathname===CONTENT_PATH)return publicContent(request,env);
  if(url.pathname===ADMIN_PREFIX||url.pathname.startsWith(ADMIN_PREFIX+'/'))return adminApi(request,env,url);
  return null;
}
