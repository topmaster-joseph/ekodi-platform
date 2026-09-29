import authWorker from './auth-worker.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessGrantIsActive, effectiveAccessCapabilities } from './access-governance.js';
import { ensureCustomerAccessSchema } from './customer-google-prereg.js';

const PREFIX='/api/seonam-medi';
const TENANT_SLUG='seonam-medi';
const NOTICE_CAP='seonam.notice.manage';
const CHANNEL_CAP='seonam.channel.manage';
const CONTENT_CAP='seonam.notice.manage';
const CONTENT_STATES=new Set(['candidate','published','rejected']);
const CONTENT_CATEGORIES=new Set(['official','news']);
const PLATFORMS=new Set(['youtube','instagram','facebook','blog','website','other']);
const CHANNEL_CATEGORIES=new Set(['official','related-org','media','civic','other']);

const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
const lower=value=>clean(value,320).toLowerCase();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const validHttps=value=>{try{const url=new URL(String(value||''));return url.protocol==='https:'?url.toString():''}catch{return''}};
const safeBool=value=>value===true||value===1||value==='1';
const safeOrder=value=>Math.max(0,Math.min(9999,Number.parseInt(String(value??0),10)||0));

async function ensureSchema(db){
  await ensureCustomerAccessSchema(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS seonam_medi_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    pinned INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonam_medi_notices_public ON seonam_medi_notices(status,pinned,published_at,updated_at);
  CREATE TABLE IF NOT EXISTS seonam_medi_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    official INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonam_medi_channels_public ON seonam_medi_channels(visible,sort_order,id);
  CREATE TABLE IF NOT EXISTS seonam_medi_admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonam_medi_admin_audit_created ON seonam_medi_admin_audit(created_at);
  INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
    VALUES('seonam-medi','서남권 국립의대 시민소통센터','ekodi.kr/seonam-medi','active',CURRENT_TIMESTAMP);`);
}

async function platformSession(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const session=await response.json().catch(()=>null);
  return session?.authenticated&&session?.email?session:null;
}

async function authority(request,env){
  if(!env?.DB?.prepare)return {ok:false,status:503,error:'storage_unavailable'};
  await ensureSchema(env.DB);
  const session=await platformSession(request,env);
  if(session?.role==='super_admin')return {ok:true,email:lower(session.email),role:'super_admin',platform:true,capabilities:['*']};
  const principal=await principalFromSupabaseRequest(request);
  if(!principal?.email)return {ok:false,status:401,error:'authentication_required'};
  const tenant=await env.DB.prepare('SELECT id,status FROM customer_tenants WHERE slug=? LIMIT 1').bind(TENANT_SLUG).first();
  if(!tenant||tenant.status!=='active')return {ok:false,status:404,error:'tenant_not_found'};
  const grant=await env.DB.prepare(`SELECT role,enabled,principal_type,capabilities_json,denied_capabilities_json,expires_at
    FROM customer_access_grants WHERE tenant_id=? AND lower(trim(email))=? LIMIT 1`).bind(tenant.id,lower(principal.email)).first();
  if(!accessGrantIsActive(grant))return {ok:false,status:403,error:'access_forbidden'};
  const capabilities=effectiveAccessCapabilities(grant);
  if(!capabilities.includes(NOTICE_CAP)&&!capabilities.includes(CHANNEL_CAP))return {ok:false,status:403,error:'access_forbidden'};
  return {ok:true,email:lower(principal.email),role:clean(grant.role,80)||'staff',platform:false,capabilities};
}

function can(auth,cap){return Boolean(auth?.ok&&(auth.platform||auth.capabilities?.includes('*')||auth.capabilities?.includes(cap)))}
async function audit(env,auth,action,type,id,detail={}){
  try{await env.DB.prepare('INSERT INTO seonam_medi_admin_audit(actor_email,action,resource_type,resource_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .bind(auth.email,action,type,id||null,JSON.stringify(detail),new Date().toISOString()).run()}catch{}
}

function publicNotice(row){return{id:Number(row.id),title:row.title,body:row.body,pinned:Boolean(row.pinned),publishedAt:row.published_at||row.updated_at,updatedAt:row.updated_at}}
function adminNotice(row){return{...publicNotice(row),status:row.status,createdBy:row.created_by,createdAt:row.created_at}}
function publicChannel(row){return{id:Number(row.id),platform:row.platform,name:row.name,url:row.url,category:row.category,official:Boolean(row.official),note:row.note||'',sortOrder:Number(row.sort_order||0)}}
function adminChannel(row){return{...publicChannel(row),visible:Boolean(row.visible),createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at}}

async function listPublicNotices(env){
  await ensureSchema(env.DB);
  const rows=await env.DB.prepare(`SELECT id,title,body,pinned,published_at,updated_at FROM seonam_medi_notices
    WHERE status='published' ORDER BY pinned DESC,COALESCE(published_at,updated_at) DESC,id DESC LIMIT 40`).all();
  return json({ok:true,items:(rows.results||[]).map(publicNotice)});
}
async function listPublicChannels(env){
  await ensureSchema(env.DB);
  const rows=await env.DB.prepare(`SELECT id,platform,name,url,category,official,note,sort_order FROM seonam_medi_channels
    WHERE visible=1 ORDER BY official DESC,sort_order ASC,id ASC LIMIT 80`).all();
  return json({ok:true,items:(rows.results||[]).map(publicChannel)});
}

async function adminMe(request,env,auth){
  const site=await env.DB.prepare('SELECT public_status,updated_at FROM public_site_controls WHERE site_id=? LIMIT 1').bind(TENANT_SLUG).first().catch(()=>null);
  return json({ok:true,email:auth.email,role:auth.role,platform:Boolean(auth.platform),capabilities:auth.capabilities||[],permissions:{notices:can(auth,NOTICE_CAP),channels:can(auth,CHANNEL_CAP),content:can(auth,CONTENT_CAP)},publicStatus:site?.public_status||'public',publicStatusUpdatedAt:site?.updated_at||''});
}

async function listAdminNotices(env,auth){
  if(!can(auth,NOTICE_CAP))return json({ok:false,error:'notice_forbidden'},403);
  const rows=await env.DB.prepare('SELECT * FROM seonam_medi_notices ORDER BY pinned DESC,updated_at DESC,id DESC LIMIT 100').all();
  return json({ok:true,items:(rows.results||[]).map(adminNotice)});
}
async function createNotice(request,env,auth){
  if(!can(auth,NOTICE_CAP))return json({ok:false,error:'notice_forbidden'},403);
  const body=await request.json().catch(()=>null);const title=clean(body?.title,180),copy=clean(body?.body,10000);
  const status=body?.status==='published'?'published':'draft';const pinned=safeBool(body?.pinned)?1:0;
  if(!title)return json({ok:false,error:'title_required'},400);
  const now=new Date().toISOString();const publishedAt=status==='published'?now:null;
  const result=await env.DB.prepare('INSERT INTO seonam_medi_notices(title,body,status,pinned,published_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(title,copy,status,pinned,publishedAt,auth.email,now,now).run();
  const id=Number(result?.meta?.last_row_id||0);await audit(env,auth,'create','notice',id,{status,pinned:Boolean(pinned)});
  return json({ok:true,id},201);
}
async function updateNotice(request,env,auth,id){
  if(!can(auth,NOTICE_CAP))return json({ok:false,error:'notice_forbidden'},403);
  const existing=await env.DB.prepare('SELECT * FROM seonam_medi_notices WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null);const title=clean(body?.title??existing.title,180),copy=clean(body?.body??existing.body,10000);
  const status=body?.status==='published'?'published':'draft';const pinned=safeBool(body?.pinned)?1:0;if(!title)return json({ok:false,error:'title_required'},400);
  const now=new Date().toISOString();const publishedAt=status==='published'?(existing.published_at||now):null;
  await env.DB.prepare('UPDATE seonam_medi_notices SET title=?,body=?,status=?,pinned=?,published_at=?,updated_at=? WHERE id=?')
    .bind(title,copy,status,pinned,publishedAt,now,id).run();
  await audit(env,auth,'update','notice',id,{status,pinned:Boolean(pinned)});return json({ok:true,id});
}
async function deleteNotice(env,auth,id){
  if(!can(auth,NOTICE_CAP))return json({ok:false,error:'notice_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,title FROM seonam_medi_notices WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.DB.prepare('DELETE FROM seonam_medi_notices WHERE id=?').bind(id).run();await audit(env,auth,'delete','notice',id,{title:existing.title});return json({ok:true,id});
}


async function listAdminContent(env,auth){
  if(!can(auth,CONTENT_CAP))return json({ok:false,error:'content_forbidden'},403);
  const rows=await env.DB.prepare(`SELECT id,title,url,resolved_url,publisher,published_at,query_label,review_state,publish_category,first_seen_at,last_seen_at
    FROM seonam_medi_monitor_items ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 150`).all();
  return json({ok:true,items:(rows.results||[]).map(row=>({id:Number(row.id),title:row.title,url:row.resolved_url||row.url,publisher:row.publisher||'',publishedAt:row.published_at||row.first_seen_at,queryLabel:row.query_label||'',reviewState:row.review_state==='verified'?'published':CONTENT_STATES.has(row.review_state)?row.review_state:'candidate',category:row.publish_category==='official'?'official':'news'}))});
}
async function updateAdminContent(request,env,auth,id){
  if(!can(auth,CONTENT_CAP))return json({ok:false,error:'content_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,title FROM seonam_medi_monitor_items WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null),state=clean(body?.state,40),category=clean(body?.category,40);
  if(!CONTENT_STATES.has(state)||!CONTENT_CATEGORIES.has(category))return json({ok:false,error:'invalid_content_review'},400);
  const stored=state==='published'?'verified':state;
  await env.DB.prepare('UPDATE seonam_medi_monitor_items SET review_state=?,publish_category=? WHERE id=?').bind(stored,category,id).run();
  await audit(env,auth,'review','web_content',id,{state,category,title:existing.title});return json({ok:true,id,state,category});
}

async function listAdminChannels(env,auth){
  if(!can(auth,CHANNEL_CAP))return json({ok:false,error:'channel_forbidden'},403);
  const rows=await env.DB.prepare('SELECT * FROM seonam_medi_channels ORDER BY sort_order ASC,id ASC LIMIT 150').all();
  return json({ok:true,items:(rows.results||[]).map(adminChannel)});
}
function channelInput(body,existing={}){
  const platform=clean(body?.platform??existing.platform,40).toLowerCase(),name=clean(body?.name??existing.name,160),url=validHttps(body?.url??existing.url);
  const category=clean(body?.category??existing.category,40).toLowerCase();
  if(!PLATFORMS.has(platform)||!name||!url||!CHANNEL_CATEGORIES.has(category))return null;
  return{platform,name,url,category,official:safeBool(body?.official)?1:0,visible:body?.visible===undefined?Number(existing.visible??1):(safeBool(body.visible)?1:0),sortOrder:safeOrder(body?.sortOrder??existing.sort_order),note:clean(body?.note??existing.note,500)};
}
async function createChannel(request,env,auth){
  if(!can(auth,CHANNEL_CAP))return json({ok:false,error:'channel_forbidden'},403);
  const body=await request.json().catch(()=>null),value=channelInput(body);if(!value)return json({ok:false,error:'invalid_channel'},400);
  const now=new Date().toISOString();const result=await env.DB.prepare(`INSERT INTO seonam_medi_channels(platform,name,url,category,official,visible,sort_order,note,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(value.platform,value.name,value.url,value.category,value.official,value.visible,value.sortOrder,value.note,auth.email,now,now).run();
  const id=Number(result?.meta?.last_row_id||0);await audit(env,auth,'create','channel',id,{platform:value.platform,name:value.name});return json({ok:true,id},201);
}
async function updateChannel(request,env,auth,id){
  if(!can(auth,CHANNEL_CAP))return json({ok:false,error:'channel_forbidden'},403);
  const existing=await env.DB.prepare('SELECT * FROM seonam_medi_channels WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null),value=channelInput(body,existing);if(!value)return json({ok:false,error:'invalid_channel'},400);
  const now=new Date().toISOString();await env.DB.prepare(`UPDATE seonam_medi_channels SET platform=?,name=?,url=?,category=?,official=?,visible=?,sort_order=?,note=?,updated_at=? WHERE id=?`)
    .bind(value.platform,value.name,value.url,value.category,value.official,value.visible,value.sortOrder,value.note,now,id).run();
  await audit(env,auth,'update','channel',id,{platform:value.platform,name:value.name,visible:Boolean(value.visible)});return json({ok:true,id});
}
async function deleteChannel(env,auth,id){
  if(!can(auth,CHANNEL_CAP))return json({ok:false,error:'channel_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,name FROM seonam_medi_channels WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.DB.prepare('DELETE FROM seonam_medi_channels WHERE id=?').bind(id).run();await audit(env,auth,'delete','channel',id,{name:existing.name});return json({ok:true,id});
}

export async function handleSeonamMediAdminApi(request,env){
  const url=new URL(request.url);
  if(url.pathname===PREFIX+'/notices'&&request.method==='GET'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);return listPublicNotices(env);
  }
  if(url.pathname===PREFIX+'/channels'&&request.method==='GET'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);return listPublicChannels(env);
  }
  if(!url.pathname.startsWith(PREFIX+'/admin/'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'GET, POST, PUT, DELETE, OPTIONS','cache-control':'no-store'}});
  const auth=await authority(request,env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status||403);
  if(url.pathname===PREFIX+'/admin/me'&&request.method==='GET')return adminMe(request,env,auth);
  if(url.pathname===PREFIX+'/admin/notices'&&request.method==='GET')return listAdminNotices(env,auth);
  if(url.pathname===PREFIX+'/admin/notices'&&request.method==='POST')return createNotice(request,env,auth);
  let match=url.pathname.match(/^\/api\/seonam-medi\/admin\/notices\/(\d+)$/);
  if(match&&request.method==='PUT')return updateNotice(request,env,auth,Number(match[1]));
  if(match&&request.method==='DELETE')return deleteNotice(env,auth,Number(match[1]));
  if(url.pathname===PREFIX+'/admin/content'&&request.method==='GET')return listAdminContent(env,auth);
  let contentMatch=url.pathname.match(/^\/api\/seonam-medi\/admin\/content\/(\d+)$/);
  if(contentMatch&&request.method==='PUT')return updateAdminContent(request,env,auth,Number(contentMatch[1]));
  if(url.pathname===PREFIX+'/admin/channels'&&request.method==='GET')return listAdminChannels(env,auth);
  if(url.pathname===PREFIX+'/admin/channels'&&request.method==='POST')return createChannel(request,env,auth);
  match=url.pathname.match(/^\/api\/seonam-medi\/admin\/channels\/(\d+)$/);
  if(match&&request.method==='PUT')return updateChannel(request,env,auth,Number(match[1]));
  if(match&&request.method==='DELETE')return deleteChannel(env,auth,Number(match[1]));
  return json({ok:false,error:'not_found'},404);
}

export const SEONAM_MEDI_ADMIN_CAPABILITIES=Object.freeze({notices:NOTICE_CAP,channels:CHANNEL_CAP,content:CONTENT_CAP});
