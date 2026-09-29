import authWorker from './auth-worker.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessGrantIsActive } from './access-governance.js';

const VOICES_PATH='/api/seonam-medi/voices';
const NOTICES_PATH='/api/seonam-medi/notices';
const CHANNELS_PATH='/api/seonam-medi/channels';
const CONTENT_PATH='/api/seonam-medi/content';
const ADMIN_PREFIX='/api/seonam-medi/admin';
const TENANT_SLUG='seonam-medi';

const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
const BOARD_CAP='seonam.board.manage';
const CHANNEL_CAP='seonam.channel.manage';
const CONTENT_CAP='seonam.content.review';
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
    status TEXT NOT NULL DEFAULT 'published',
    pinned INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_seonam_med_notices_public ON seonam_med_notices(status,pinned,published_at,created_at);

  CREATE TABLE IF NOT EXISTS seonam_med_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    official INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
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
  if(!capabilities.includes('*')&&!capabilities.some(cap=>[BOARD_CAP,CHANNEL_CAP,CONTENT_CAP].includes(cap)))return {ok:false,status:403,code:'ACCESS_FORBIDDEN'};
  return {ok:true,email,role,platform:false,capabilities};
}

const can=(authority,cap)=>Boolean(authority?.ok&&(authority.capabilities.includes('*')||authority.capabilities.includes(cap)));

async function audit(env,authority,action,type,id,detail={}){
  await env.DB.prepare('INSERT INTO seonam_med_content_audit(actor_email,action,resource_type,resource_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .bind(authority.email,action,type,id||null,JSON.stringify(detail).slice(0,4000),new Date().toISOString()).run();
}

async function publicStatus(env){
  try{
    const row=await env.DB.prepare('SELECT public_status FROM public_site_controls WHERE site_id=? LIMIT 1').bind(TENANT_SLUG).first();
    return ['public','private','maintenance'].includes(row?.public_status)?row.public_status:'public';
  }catch{return'public'}
}

const noticeView=row=>({
  id:Number(row.id),title:row.title,body:row.body,status:row.status,pinned:Boolean(row.pinned),
  publishedAt:row.published_at||'',createdAt:row.created_at,updatedAt:row.updated_at,updatedBy:row.updated_by||''
});
const channelView=row=>({
  id:Number(row.id),platform:row.platform,name:row.name,url:row.url,category:row.category,official:Boolean(row.official),
  visible:Boolean(row.visible),sortOrder:Number(row.sort_order||0),note:row.note||'',createdAt:row.created_at,updatedAt:row.updated_at,updatedBy:row.updated_by||''
});

async function publicNotices(request,env){
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable',items:[]},503);
  await ensureSchema(env.DB);
  const rows=await env.DB.prepare(`SELECT id,title,body,status,pinned,published_at,created_at,updated_at,updated_by
    FROM seonam_med_notices WHERE status='published'
    ORDER BY pinned DESC,COALESCE(published_at,created_at) DESC,id DESC LIMIT 50`).all();
  return json({ok:true,items:(rows.results||[]).map(noticeView)});
}

async function publicChannels(request,env){
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable',items:[]},503);
  await ensureSchema(env.DB);
  const rows=await env.DB.prepare(`SELECT id,platform,name,url,category,official,visible,sort_order,note,created_at,updated_at,updated_by
    FROM seonam_med_channels WHERE visible=1 ORDER BY sort_order ASC,id ASC LIMIT 100`).all();
  return json({ok:true,items:(rows.results||[]).map(channelView)});
}

async function publicContent(request,env){
  if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
  const [noticesResponse,channelsResponse]=await Promise.all([publicNotices(request,env),publicChannels(request,env)]);
  const [notices,channels]=await Promise.all([noticesResponse.json(),channelsResponse.json()]);
  return json({ok:true,notices:notices.items||[],channels:channels.items||[],organization:{status:'planned',message:'조직 구성은 추후 공개 예정입니다.'}});
}

async function monitorReviewRows(env){
  try{
    const rows=await env.DB.prepare(`SELECT id,title,url,resolved_url,publisher,published_at,query_key,query_label,review_state,publish_category,first_seen_at,last_seen_at
      FROM seonam_medi_monitor_items ORDER BY COALESCE(published_at,first_seen_at) DESC,id DESC LIMIT 120`).all();
    return rows.results||[];
  }catch{
    const rows=await env.DB.prepare(`SELECT id,title,url,resolved_url,publisher,published_at,query_key,query_label,review_state,first_seen_at,last_seen_at
      FROM seonam_medi_monitor_items ORDER BY COALESCE(published_at,first_seen_at) DESC,id DESC LIMIT 120`).all();
    return (rows.results||[]).map(row=>({...row,publish_category:'news'}));
  }
}

async function adminApi(request,env,url){
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
  await ensureSchema(env.DB);
  const authority=await editorAuthority(request,env);
  if(!authority.ok)return json({ok:false,error:authority.code},authority.status||403);

  const suffix=url.pathname.slice(ADMIN_PREFIX.length).replace(/^\/+|\/+$/g,'');
  if(suffix==='me'&&request.method==='GET'){
    return json({
      ok:true,email:authority.email,role:authority.role,platform:authority.platform,capabilities:authority.capabilities,
      publicStatus:await publicStatus(env),
      permissions:{content:can(authority,CONTENT_CAP),notices:can(authority,BOARD_CAP),channels:can(authority,CHANNEL_CAP)}
    });
  }

  const contentMatch=suffix.match(/^content(?:\/(\d+))?$/);
  if(contentMatch){
    if(!can(authority,CONTENT_CAP))return json({ok:false,error:'CONTENT_REVIEW_FORBIDDEN'},403);
    const id=Number(contentMatch[1]||0);
    if(request.method==='GET'){
      const rows=await monitorReviewRows(env);
      return json({ok:true,items:rows.map(row=>({
        id:Number(row.id),title:row.title,url:row.resolved_url||row.url,publisher:row.publisher||'',publishedAt:row.published_at||'',
        queryLabel:row.query_label||'',reviewState:row.review_state==='verified'?'published':row.review_state,
        category:row.publish_category==='official'?'official':'news',firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at
      }))});
    }
    if(request.method==='PUT'){
      if(!id)return json({ok:false,error:'id_required'},400);
      let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
      const nextState=body?.state==='published'?'verified':'rejected';
      const category=body?.category==='official'?'official':'news';
      try{
        await env.DB.prepare('UPDATE seonam_medi_monitor_items SET review_state=?,publish_category=? WHERE id=?').bind(nextState,category,id).run();
      }catch{
        await env.DB.prepare('UPDATE seonam_medi_monitor_items SET review_state=? WHERE id=?').bind(nextState,id).run();
      }
      await audit(env,authority,'content.review','monitor_item',id,{state:nextState,category});
      return json({ok:true,id,state:body?.state==='published'?'published':'rejected',category});
    }
    return json({ok:false,error:'method_not_allowed'},405);
  }

  const noticeMatch=suffix.match(/^notices(?:\/(\d+))?$/);
  if(noticeMatch){
    if(!can(authority,BOARD_CAP))return json({ok:false,error:'NOTICE_MANAGE_FORBIDDEN'},403);
    const id=Number(noticeMatch[1]||0);
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,title,body,status,pinned,published_at,created_at,updated_at,updated_by FROM seonam_med_notices ORDER BY pinned DESC,COALESCE(published_at,created_at) DESC,id DESC').all();
      return json({ok:true,items:(rows.results||[]).map(noticeView)});
    }
    if(request.method==='POST'||request.method==='PUT'){
      let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
      const title=clean(body?.title,180),noticeBody=clean(body?.body,10000),status=body?.status==='draft'?'draft':'published',pinned=body?.pinned===true?1:0;
      if(!title)return json({ok:false,error:'title_required'},400);
      const now=new Date().toISOString(),publishedAt=status==='published'?now:null;
      if(request.method==='POST'){
        const result=await env.DB.prepare('INSERT INTO seonam_med_notices(title,body,status,pinned,published_at,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)')
          .bind(title,noticeBody,status,pinned,publishedAt,now,now,authority.email).run();
        const newId=Number(result?.meta?.last_row_id||0);
        await audit(env,authority,'notice.create','notice',newId,{title,status,pinned:Boolean(pinned)});
        return json({ok:true,id:newId},201);
      }
      if(!id)return json({ok:false,error:'id_required'},400);
      const existing=await env.DB.prepare('SELECT published_at FROM seonam_med_notices WHERE id=?').bind(id).first();
      await env.DB.prepare('UPDATE seonam_med_notices SET title=?,body=?,status=?,pinned=?,published_at=?,updated_at=?,updated_by=? WHERE id=?')
        .bind(title,noticeBody,status,pinned,status==='published'?(existing?.published_at||now):null,now,authority.email,id).run();
      await audit(env,authority,'notice.update','notice',id,{title,status,pinned:Boolean(pinned)});
      return json({ok:true,id});
    }
    if(request.method==='DELETE'){
      if(!id)return json({ok:false,error:'id_required'},400);
      await env.DB.prepare('DELETE FROM seonam_med_notices WHERE id=?').bind(id).run();
      await audit(env,authority,'notice.delete','notice',id);
      return json({ok:true,id});
    }
    return json({ok:false,error:'method_not_allowed'},405);
  }

  const channelMatch=suffix.match(/^channels(?:\/(\d+))?$/);
  if(channelMatch){
    if(!can(authority,CHANNEL_CAP))return json({ok:false,error:'CHANNEL_MANAGE_FORBIDDEN'},403);
    const id=Number(channelMatch[1]||0);
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,platform,name,url,category,official,visible,sort_order,note,created_at,updated_at,updated_by FROM seonam_med_channels ORDER BY sort_order ASC,id ASC').all();
      return json({ok:true,items:(rows.results||[]).map(channelView)});
    }
    if(request.method==='POST'||request.method==='PUT'){
      let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
      const platform=clean(body?.platform,40)||'other',name=clean(body?.name,160),href=safeHttps(body?.url),category=clean(body?.category,40)||'other',official=body?.official===true?1:0,visible=body?.visible===false?0:1,sortOrder=Math.max(0,Math.min(9999,Number.parseInt(body?.sortOrder,10)||0)),note=clean(body?.note,500);
      if(!name||!href)return json({ok:false,error:'channel_fields_required'},400);
      const now=new Date().toISOString();
      if(request.method==='POST'){
        const result=await env.DB.prepare('INSERT INTO seonam_med_channels(platform,name,url,category,official,visible,sort_order,note,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .bind(platform,name,href,category,official,visible,sortOrder,note,now,now,authority.email).run();
        const newId=Number(result?.meta?.last_row_id||0);
        await audit(env,authority,'channel.create','channel',newId,{platform,name,url:href,category,official:Boolean(official),visible:Boolean(visible)});
        return json({ok:true,id:newId},201);
      }
      if(!id)return json({ok:false,error:'id_required'},400);
      await env.DB.prepare('UPDATE seonam_med_channels SET platform=?,name=?,url=?,category=?,official=?,visible=?,sort_order=?,note=?,updated_at=?,updated_by=? WHERE id=?')
        .bind(platform,name,href,category,official,visible,sortOrder,note,now,authority.email,id).run();
      await audit(env,authority,'channel.update','channel',id,{platform,name,url:href,category,official:Boolean(official),visible:Boolean(visible)});
      return json({ok:true,id});
    }
    if(request.method==='DELETE'){
      if(!id)return json({ok:false,error:'id_required'},400);
      await env.DB.prepare('DELETE FROM seonam_med_channels WHERE id=?').bind(id).run();
      await audit(env,authority,'channel.delete','channel',id);
      return json({ok:true,id});
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
  if(url.pathname===NOTICES_PATH)return publicNotices(request,env);
  if(url.pathname===CHANNELS_PATH)return publicChannels(request,env);
  if(url.pathname===CONTENT_PATH)return publicContent(request,env);
  if(url.pathname===ADMIN_PREFIX||url.pathname.startsWith(ADMIN_PREFIX+'/'))return adminApi(request,env,url);
  return null;
}
