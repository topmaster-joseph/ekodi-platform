import { principalFromSupabaseRequest } from './ekodi-principal.js';

const CENTRAL_SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const CENTRAL_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
const lower=value=>clean(value,320).toLowerCase();
const json=(data,status=200,extraHeaders={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extraHeaders}});
const now=()=>new Date().toISOString();
const BOARD_MANAGE_ROLES=new Set(['owner','admin','moderator']);
// Church announcement and event categories are official publications, not member posts.
export function churchOfficialCategoryRequiresManager(siteId,categoryId){
  return siteId==='ekodichurch'&&['notice','schedule'].includes(safeCategoryId(categoryId));
}
const MISSION_OFFICIAL_CATEGORIES=Object.freeze(['mission-notice','mission-schedule']);
const isMissionOfficialCategory=(instance,categoryId)=>instance.site_id==='ekodimission'&&MISSION_OFFICIAL_CATEGORIES.includes(categoryId);
const isChurchOfficialCategory=(instance,categoryId)=>churchOfficialCategoryRequiresManager(instance.site_id,categoryId);
const isPublicOfficialCategory=(instance,categoryId)=>isMissionOfficialCategory(instance,categoryId)||isChurchOfficialCategory(instance,categoryId);
const PATH_TENANT_ALIASES=Object.freeze({
  ekodimission:'ekodimission',
  ekodichurch:'ekodichurch',
  cheonggye:'cheonggye-local',
  cgma:'cheonggye',
  community:'community',
  seonammedi:'seonammedi',
});
const INTERNAL_BOARD_SERVICE_HOST='board.internal.ekodi';
const CUSTOM_HOST_SITE=Object.freeze({
  'seonammedi.kr':'seonammedi',
  'www.seonammedi.kr':'seonammedi',
  'xn--3e0b8b58jw4co4mnpll3k.kr':'seonammedi',
  'www.xn--3e0b8b58jw4co4mnpll3k.kr':'seonammedi',
  'cgma.or.kr':'cgma',
  'www.cgma.or.kr':'cgma',
});

function safeSiteId(value){
  const id=lower(value).replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'');
  return id.slice(0,80);
}
function boardId(siteId){return `site:${safeSiteId(siteId)}:main`;}
function tenantSlugFor(siteId){return PATH_TENANT_ALIASES[safeSiteId(siteId)]||safeSiteId(siteId);}

export function resolveSiteBoardRoute(input){
  const url=input instanceof URL?input:new URL(String(input));
  const host=lower(url.hostname);
  const custom=CUSTOM_HOST_SITE[host];
  if(custom&&(url.pathname==='/board'||url.pathname.startsWith('/board/'))){
    return Object.freeze({siteId:custom,tenantSlug:tenantSlugFor(custom),basePath:'/board',subPath:url.pathname.slice('/board'.length)||'/'});
  }
  if(host==='ekodi.kr'||host===INTERNAL_BOARD_SERVICE_HOST){
    const match=url.pathname.match(/^\/([a-z0-9-]+)\/board(?:\/(.*))?\/?$/i);
    if(match){
      const siteId=safeSiteId(match[1]);
      const rest=match[2]?'/'+match[2]:'/';
      return Object.freeze({siteId,tenantSlug:tenantSlugFor(siteId),basePath:`/${siteId}/board`,subPath:rest});
    }
  }
  return null;
}

async function dynamicDomainRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/board'&&!url.pathname.startsWith('/board/'))return null;
  if(!env?.DB?.prepare)return null;
  const host=lower(url.hostname).replace(/^www\./,'');
  const row=await env.DB.prepare(`SELECT slug,domain,status FROM customer_tenants
    WHERE status='active' AND (lower(domain)=? OR lower(domain)=? OR lower(domain)=?) LIMIT 1`)
    .bind(host,`www.${host}`,`https://${host}`).first().catch(()=>null);
  if(!row?.slug)return null;
  const siteId=safeSiteId(row.slug);
  return Object.freeze({siteId,tenantSlug:siteId,basePath:'/board',subPath:url.pathname.slice('/board'.length)||'/'});
}

async function ensureSchema(env){
  if(!env?.DB?.prepare)throw new Error('board_db_unavailable');
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_instances (
      board_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL UNIQUE,
      tenant_slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      visibility TEXT NOT NULL DEFAULT 'public',
      allow_anonymous_write INTEGER NOT NULL DEFAULT 0,
      comments_enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL,
      author_person_id TEXT NOT NULL DEFAULT '',
      author_email TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ekodi_board_posts_board_created ON ekodi_board_posts(board_id,status,created_at DESC,id DESC)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      author_person_id TEXT NOT NULL DEFAULT '',
      author_email TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ekodi_board_comments_post ON ekodi_board_comments(board_id,post_id,status,created_at,id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL,
      actor_person_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_memberships (
      board_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(board_id,person_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_categories (
      board_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(board_id,category_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_post_categories (
      board_id TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      category_id TEXT NOT NULL,
      PRIMARY KEY(board_id,post_id,category_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_board_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      uploader_person_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ekodi_board_attachments_post ON ekodi_board_attachments(board_id,post_id,status,id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_mission_saturday_events (
      board_id TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      starts_at TEXT NOT NULL DEFAULT '11:00',
      venue TEXT NOT NULL DEFAULT '에코디교회',
      title TEXT NOT NULL DEFAULT '토요 성경토론과 함께하는 식사',
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL,
      PRIMARY KEY(board_id,meeting_date)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_mission_saturday_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      author_person_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      body TEXT NOT NULL,
      attendance TEXT NOT NULL DEFAULT 'join',
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(board_id,meeting_date,author_person_id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mission_saturday_replies_date ON ekodi_mission_saturday_replies(board_id,meeting_date,status,id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_mission_recurring_participation (
      board_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(board_id,person_id)
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ekodi_mission_saturday_private_rsvp (
      board_id TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      person_id TEXT NOT NULL,
      attendance TEXT NOT NULL CHECK(attendance IN ('join','cancel','maybe')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(board_id,meeting_date,person_id)
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mission_private_rsvp_date ON ekodi_mission_saturday_private_rsvp(board_id,meeting_date,attendance)'),
  ]);
}

async function ensureInstance(env,route){
  await ensureSchema(env);
  const id=boardId(route.siteId),stamp=now();
  await env.DB.prepare(`INSERT OR IGNORE INTO ekodi_board_instances
    (board_id,site_id,tenant_slug,status,visibility,allow_anonymous_write,comments_enabled,config_json,created_at,updated_at)
    VALUES (?,?,?,'active','public',0,1,'{}',?,?)`)
    .bind(id,route.siteId,route.tenantSlug,stamp,stamp).run();
  return env.DB.prepare('SELECT * FROM ekodi_board_instances WHERE board_id=? LIMIT 1').bind(id).first();
}

// The independent board accepts an EKODI administrator only after the internal
// CONTROL_API validates the real bearer session. A claimed email, header or
// platform role never grants board-local owner/admin/moderator permissions.
async function verifiedAdminPrincipal(request,env){
  if(!env?.CONTROL_API?.fetch)return null;
  const authorization=String(request.headers.get('authorization')||'');
  if(!/^Bearer [^\s]+$/.test(authorization)||authorization.length>8192)return null;
  const url=new URL(request.url);
  url.pathname='/api/session';
  url.search='';
  url.hash='';
  const response=await env.CONTROL_API.fetch(new Request(url.toString(),{
    method:'GET',headers:{authorization},redirect:'manual',
  })).catch(()=>null);
  if(!response?.ok)return null;
  const session=await response.json().catch(()=>null);
  if(session?.authenticated!==true||!['super_admin','admin'].includes(lower(session.role)))return null;
  const email=lower(session.email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return null;
  const personId='admin:'+email;
  return Object.freeze({id:personId,email,subject:{key:personId}});
}

async function actor(request,env,instance){
  const principal=await verifiedAdminPrincipal(request,env)
    || await principalFromSupabaseRequest(request).catch(()=>null);
  if(!principal?.id)return Object.freeze({authenticated:false,personId:'',email:'',role:'anonymous',boardMember:false,manage:false});
  const personId=clean(principal.subject?.key||principal.id,160);
  const email=lower(principal.email);
  const membership=await env.DB.prepare(`SELECT role,status FROM ekodi_board_memberships
    WHERE board_id=? AND person_id=? LIMIT 1`).bind(instance.board_id,personId).first().catch(()=>null);
  const boardMember=membership?.status==='active';
  const role=boardMember?(lower(membership.role)||'member'):'member';
  const manage=boardMember&&BOARD_MANAGE_ROLES.has(role);
  return Object.freeze({authenticated:true,personId,email,role,boardMember,manage});
}

async function verifySuperAdminReauth(request,env,instance,scope){
  if(!env?.CONTROL_API?.fetch)return {ok:false,status:503,error:'reauth_service_unavailable'};
  const proof=String(request.headers.get('x-ekodi-reauth-proof')||'').trim();
  if(!proof)return {ok:false,status:401,error:'super_admin_reauthentication_required'};
  const url=new URL(request.url);url.pathname='/api/reauth/verify';url.search='';url.hash='';
  const response=await env.CONTROL_API.fetch(new Request(url.toString(),{
    method:'POST',
    headers:{'content-type':'application/json','x-ekodi-reauth-proof':proof},
    body:JSON.stringify({scope,resource:instance.board_id}),
  }));
  const data=await response.json().catch(()=>null);
  return response.ok&&data?.verified===true?{ok:true,data}:{ok:false,status:response.status||403,error:data?.error||'reauth_failed'};
}

async function snapshotBoard(env,instance,who,reason){
  const [posts,comments,memberships,categories,postCategories,attachments]=await Promise.all([
    env.DB.prepare('SELECT * FROM ekodi_board_posts WHERE board_id=? ORDER BY id').bind(instance.board_id).all(),
    env.DB.prepare('SELECT * FROM ekodi_board_comments WHERE board_id=? ORDER BY id').bind(instance.board_id).all(),
    env.DB.prepare('SELECT * FROM ekodi_board_memberships WHERE board_id=? ORDER BY person_id').bind(instance.board_id).all(),
    env.DB.prepare('SELECT * FROM ekodi_board_categories WHERE board_id=? ORDER BY sort_order,name').bind(instance.board_id).all(),
    env.DB.prepare('SELECT * FROM ekodi_board_post_categories WHERE board_id=? ORDER BY post_id,category_id').bind(instance.board_id).all(),
    env.DB.prepare('SELECT * FROM ekodi_board_attachments WHERE board_id=? ORDER BY id').bind(instance.board_id).all(),
  ]);
  const snapshot={schemaVersion:2,board:{...instance},posts:posts.results||[],comments:comments.results||[],memberships:memberships.results||[],categories:categories.results||[],postCategories:postCategories.results||[],attachments:attachments.results||[]};
  const result=await env.DB.prepare(`INSERT INTO ekodi_board_snapshots
    (board_id,reason,snapshot_json,created_by,created_at) VALUES (?,?,?,?,?)`)
    .bind(instance.board_id,reason,JSON.stringify(snapshot),who?.personId||'',now()).run();
  return Number(result?.meta?.last_row_id||0);
}

async function audit(env,instance,who,action,targetType='',targetId='',detail={}){
  await env.DB.prepare(`INSERT INTO ekodi_board_audit
    (board_id,actor_person_id,action,target_type,target_id,detail_json,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(instance.board_id,who?.personId||'',action,targetType,String(targetId||''),JSON.stringify(detail||{}),now()).run().catch(()=>null);
}

function publicPost(row){return {id:Number(row.id),title:row.title,body:row.body,categoryId:row.category_id||null,createdAt:row.created_at,updatedAt:row.updated_at};}
function publicComment(row){return {id:Number(row.id),postId:Number(row.post_id),body:row.body,createdAt:row.created_at,updatedAt:row.updated_at};}
function publicAttachment(row){return {id:Number(row.id),postId:Number(row.post_id),name:row.name,url:row.url,mimeType:row.mime_type||'',sizeBytes:Number(row.size_bytes||0),createdAt:row.created_at,updatedAt:row.updated_at};}
function safeCategoryId(value){return lower(value).replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);}
function safeAttachmentUrl(value){try{const url=new URL(clean(value,2000));return url.protocol==='https:'?url.toString():''}catch{return''}}
const boardJson=(instance,data,status=200)=>json(data,status,{'x-ekodi-board-id':instance.board_id,'x-ekodi-board-independent':'true'});
async function parseBody(request){try{return await request.json()}catch{return null}}

async function listPosts(env,instance,categoryId=''){
  const selected=isPublicOfficialCategory(instance,categoryId)?categoryId:'';
  const rows=selected
    ?await env.DB.prepare(`SELECT p.id,p.title,p.body,p.created_at,p.updated_at,pc.category_id
      FROM ekodi_board_posts p JOIN ekodi_board_post_categories pc
        ON pc.board_id=p.board_id AND pc.post_id=p.id
      WHERE p.board_id=? AND p.status='published' AND pc.category_id=?
      ORDER BY p.created_at DESC,p.id DESC LIMIT 100`).bind(instance.board_id,selected).all()
    :await env.DB.prepare(`SELECT p.id,p.title,p.body,p.created_at,p.updated_at,
      (SELECT pc.category_id FROM ekodi_board_post_categories pc WHERE pc.board_id=p.board_id AND pc.post_id=p.id ORDER BY pc.category_id LIMIT 1) AS category_id
      FROM ekodi_board_posts p WHERE p.board_id=? AND p.status='published' ORDER BY p.created_at DESC,p.id DESC LIMIT 100`).bind(instance.board_id).all();
  return (rows.results||[]).map(publicPost);
}
async function readPost(env,instance,id){
  const post=await env.DB.prepare(`SELECT p.*,
      (SELECT pc.category_id FROM ekodi_board_post_categories pc WHERE pc.board_id=p.board_id AND pc.post_id=p.id ORDER BY pc.category_id LIMIT 1) AS category_id
    FROM ekodi_board_posts p WHERE p.board_id=? AND p.id=? AND p.status='published' LIMIT 1`).bind(instance.board_id,id).first();
  if(!post)return null;
  const comments=await env.DB.prepare(`SELECT id,post_id,body,created_at,updated_at FROM ekodi_board_comments
    WHERE board_id=? AND post_id=? AND status='published' ORDER BY created_at,id`).bind(instance.board_id,id).all();
  return {...publicPost(post),comments:(comments.results||[]).map(publicComment)};
}

function htmlEscape(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function page(route,posts,categoryId=''){
  const items=posts.length?posts.map(post=>`<article><a href="${route.basePath}/post/${post.id}"><h2>${htmlEscape(post.title)}</h2></a><p>${htmlEscape(post.body).slice(0,220)}</p><time>${htmlEscape(post.createdAt)}</time></article>`).join(''):'<p class="empty">등록된 글이 없습니다.</p>';
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${['mission-notice','notice'].includes(categoryId)?'공지사항':['mission-schedule','schedule'].includes(categoryId)?'주요일정':'게시판'}</title><style>body{margin:0;background:#fff;color:#111;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}main{width:min(920px,calc(100% - 28px));margin:0 auto;padding:18px 0}header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:12px 0}h1{font-size:22px;margin:0}article{padding:15px 0;border-bottom:1px solid #e6e6e6}h2{font-size:18px;margin:0 0 7px}a{color:#111;text-decoration:none}p{white-space:pre-wrap;line-height:1.5;margin:0 0 7px}time{font-size:12px;color:#666}.empty{padding:30px 0}</style></head><body><main><header><h1>${['mission-notice','notice'].includes(categoryId)?'공지사항':['mission-schedule','schedule'].includes(categoryId)?'주요일정':'게시판'}</h1>${categoryId?`<p><a href="${route.siteId==='ekodichurch'?'/ekodichurch':'/ekodimission'}">${route.siteId==='ekodichurch'?'에코디교회':'에코디선교회'} 홈으로</a></p>`:''}</header>${items}</main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-ekodi-board-id':boardId(route.siteId),'x-ekodi-board-independent':'true'}});
}
function postPage(route,post){
  if(!post)return new Response('Not Found',{status:404});
  const comments=post.comments.map(c=>`<li>${htmlEscape(c.body)} <small>${htmlEscape(c.createdAt)}</small></li>`).join('');
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(post.title)}</title></head><body><main><p><a href="${route.basePath}">← 게시판</a></p><h1>${htmlEscape(post.title)}</h1><p style="white-space:pre-wrap">${htmlEscape(post.body)}</p><hr><ul>${comments}</ul></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-ekodi-board-id':boardId(route.siteId),'x-ekodi-board-independent':'true'}});
}


export const MISSION_SATURDAY_STARTED='2024-02-03';
export function missionKstToday(at=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at);
  const get=part=>parts.find(item=>item.type===part)?.value||'';
  return [get('year'),get('month'),get('day')].join('-');
}
export function missionSaturdayFor(today){
  const start=new Date(today+'T00:00:00Z');
  const days=(6-start.getUTCDay()+7)%7;
  start.setUTCDate(start.getUTCDate()+days);
  return start.toISOString().slice(0,10);
}
function missionSaturdayFollowing(date,weeks){
  const start=new Date(date+'T00:00:00Z');
  start.setUTCDate(start.getUTCDate()+7*weeks);
  return start.toISOString().slice(0,10);
}

export function missionSaturdayLastPast(nextSaturday){
  return missionSaturdayFollowing(nextSaturday,-1);
}
async function missionEnsureWeeklyDates(env,boardId,today,nextSaturday){
  // A single, idempotent D1 statement registers every Saturday since 2024-02-03.
  // INSERT OR IGNORE preserves operator changes (cancelled/rescheduled) and prior replies.
  // Read-time synthesis needs no fixed cron; the window rolls indefinitely.
  const until=missionSaturdayFollowing(nextSaturday,7);
  await env.DB.prepare(`WITH RECURSIVE weekly(meeting_date) AS (
    SELECT ?
    UNION ALL
    SELECT date(meeting_date,'+7 days') FROM weekly WHERE meeting_date < ?
  )
  INSERT OR IGNORE INTO ekodi_mission_saturday_events
   (board_id,meeting_date,starts_at,venue,title,status,created_at)
  SELECT ?,meeting_date,CASE WHEN meeting_date='2026-11-07' THEN '17:00' ELSE '11:00' END,'에코디교회','토요 성경토론과 함께하는 식사',
    CASE WHEN meeting_date < ? THEN 'completed' ELSE 'scheduled' END,?
  FROM weekly WHERE meeting_date <= ?`)
    .bind(MISSION_SATURDAY_STARTED,until,boardId,today,now(),until).run();
  // 2026-11-07 was a one-day 17:00 exception. Every other Saturday defaults
  // to 11:00 KST. Preserve an older exception row without rewriting history.
  await env.DB.prepare(`UPDATE ekodi_mission_saturday_events SET starts_at='17:00'
    WHERE board_id=? AND meeting_date='2026-11-07' AND starts_at='11:00'
      AND venue='에코디교회' AND title='토요 성경토론과 함께하는 식사'
      AND status='scheduled'`)
    .bind(boardId).run();
  // Roll back the earlier mistaken weekly-17:00 auto-conversion, bounded to
  // upcoming scheduled rows with the unchanged default event metadata.
  // Explicitly customized venue, title, time and cancelled/history stay intact.
  await env.DB.prepare(`UPDATE ekodi_mission_saturday_events SET starts_at='11:00'
    WHERE board_id=? AND meeting_date>'2026-11-07' AND meeting_date>=?
      AND starts_at='17:00' AND status='scheduled' AND venue='에코디교회'
      AND title='토요 성경토론과 함께하는 식사'`)
    .bind(boardId,today).run();
  // A completed calendar day is archived after 00:00 Asia/Seoul.
  // Preserve cancelled/modified statuses; only scheduled dates roll to completed.
  await env.DB.prepare(`UPDATE ekodi_mission_saturday_events
    SET status='completed' WHERE board_id=? AND meeting_date<? AND status='scheduled'`)
    .bind(boardId,today).run();
}
async function missionSaturdayHistory(request,env,instance,method){
  if(method!=='GET')return boardJson(instance,{error:'method_not_allowed'},405);
  const today=missionKstToday(),next=missionSaturdayFor(today);
  await missionEnsureWeeklyDates(env,instance.board_id,today,next);
  const url=new URL(request.url),params=url.searchParams;
  const year=params.get('year')||'all',month=params.get('month')||'all',cursor=params.get('cursor')||'';
  const currentYear=Number(today.slice(0,4));
  if(year!=='all'&&(!/^\d{4}$/.test(year)||Number(year)<2024||Number(year)>currentYear))return boardJson(instance,{error:'invalid_year'},400);
  if(month!=='all'&&!/^(0[1-9]|1[012])$/.test(month))return boardJson(instance,{error:'invalid_month'},400);
  if(cursor&&(!/^\d{4}-\d{2}-\d{2}$/.test(cursor)||cursor<MISSION_SATURDAY_STARTED||cursor>next))return boardJson(instance,{error:'invalid_cursor'},400);
  const requested=Number(params.get('limit')||12);
  const limit=Number.isFinite(requested)?Math.max(1,Math.min(24,Math.trunc(requested))):12;
  const rows=await env.DB.prepare(`SELECT meeting_date,starts_at,venue,title,status
    FROM ekodi_mission_saturday_events
    WHERE board_id=? AND meeting_date>=? AND meeting_date<?
      AND (?='all' OR substr(meeting_date,1,4)=?)
      AND (?='all' OR substr(meeting_date,6,2)=?)
      AND meeting_date<?
    ORDER BY meeting_date DESC LIMIT ?`)
    .bind(instance.board_id,MISSION_SATURDAY_STARTED,next,year,year,month,month,cursor||next,limit+1).all();
  const results=rows.results||[],hasMore=results.length>limit,visible=results.slice(0,limit);
  const years=Array.from({length:currentYear-2024+1},(_,i)=>String(currentYear-i));
  return boardJson(instance,{
    ok:true,startedOn:MISSION_SATURDAY_STARTED,nextMeetingDate:next,
    lastPastDate:missionSaturdayLastPast(next),years,year,month,
    items:visible.map(row=>({date:row.meeting_date,time:row.starts_at,venue:row.venue,title:row.title,status:row.status})),
    nextCursor:hasMore?visible.at(-1)?.meeting_date:null,
  });
}

// Private, revocable intention only. It never creates attendance proof or points.
export function missionEffectiveRsvp(recurring,override,meetingStatus='scheduled'){
  if(meetingStatus!=='scheduled')return 'unavailable';
  if(['join','cancel','maybe'].includes(override))return override;
  return recurring?'join':'maybe';
}
async function missionSaturdayParticipation(request,env,instance,who,method){
  if(instance.status!=='active')return boardJson(instance,{error:'board_unavailable'},410);
  if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
  if(instance.visibility==='members'&&!who.boardMember)return boardJson(instance,{error:'board_membership_required'},403);
  if(!['GET','POST'].includes(method))return boardJson(instance,{error:'method_not_allowed'},405);
  const today=missionKstToday(),date=missionSaturdayFor(today);
  await missionEnsureWeeklyDates(env,instance.board_id,today,date);
  const meeting=await env.DB.prepare(`SELECT meeting_date,starts_at,venue,title,status
    FROM ekodi_mission_saturday_events WHERE board_id=? AND meeting_date=? LIMIT 1`)
    .bind(instance.board_id,date).first();
  if(!meeting)return boardJson(instance,{error:'meeting_unavailable'},503);
  if(method==='POST'){
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)return boardJson(instance,{error:'origin_not_allowed'},403);
    const size=Number(request.headers.get('content-length')||0);
    if(size>2048)return boardJson(instance,{error:'payload_too_large'},413);
    const body=await parseBody(request);
    if(!body||typeof body!=='object'||Array.isArray(body))return boardJson(instance,{error:'invalid_request'},400);
    const stamp=now();
    if(body.kind==='recurring'){
      if(typeof body.enabled!=='boolean')return boardJson(instance,{error:'explicit_choice_required'},400);
      await env.DB.prepare(`INSERT INTO ekodi_mission_recurring_participation
        (board_id,person_id,enabled,created_at,updated_at)
        VALUES (?,?,?,?,?) ON CONFLICT(board_id,person_id)
        DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at`)
        .bind(instance.board_id,who.personId,body.enabled?1:0,stamp,stamp).run();
      await audit(env,instance,who,body.enabled?'saturday.recurring.opt_in':'saturday.recurring.opt_out','recurring','saturday',{enabled:body.enabled});
    }else if(body.kind==='meeting'){
      if(body.meetingDate!==date)return boardJson(instance,{error:'meeting_date_changed',meetingDate:date},409);
      if(meeting.status!=='scheduled')return boardJson(instance,{error:'meeting_not_open'},409);
      if(!['join','cancel','maybe','default'].includes(body.attendance))return boardJson(instance,{error:'invalid_attendance'},400);
      if(body.attendance==='default'){
        await env.DB.prepare(`DELETE FROM ekodi_mission_saturday_private_rsvp
          WHERE board_id=? AND meeting_date=? AND person_id=?`)
          .bind(instance.board_id,date,who.personId).run();
      }else{
        await env.DB.prepare(`INSERT INTO ekodi_mission_saturday_private_rsvp
          (board_id,meeting_date,person_id,attendance,created_at,updated_at)
          VALUES (?,?,?,?,?,?) ON CONFLICT(board_id,meeting_date,person_id)
          DO UPDATE SET attendance=excluded.attendance,updated_at=excluded.updated_at`)
          .bind(instance.board_id,date,who.personId,body.attendance,stamp,stamp).run();
      }
      await audit(env,instance,who,'saturday.private_rsvp.update','saturday',date,{attendance:body.attendance});
    }else return boardJson(instance,{error:'invalid_action'},400);
  }
  const recurring=await env.DB.prepare(`SELECT enabled FROM ekodi_mission_recurring_participation
    WHERE board_id=? AND person_id=? LIMIT 1`).bind(instance.board_id,who.personId).first();
  const override=await env.DB.prepare(`SELECT attendance FROM ekodi_mission_saturday_private_rsvp
    WHERE board_id=? AND meeting_date=? AND person_id=? LIMIT 1`)
    .bind(instance.board_id,date,who.personId).first();
  const enabled=Number(recurring?.enabled||0)===1;
  const response={
    ok:true,meeting:{date:meeting.meeting_date,time:meeting.starts_at,status:meeting.status},
    recurring:enabled,override:override?.attendance||null,
    planned:missionEffectiveRsvp(enabled,override?.attendance,meeting.status),
    actualAttendance:'not_verified',
    note:'참여 예정 정보이며 실제 출석이나 포인트 지급을 의미하지 않습니다.'
  };
  if(who.manage){
    const count=await env.DB.prepare(`SELECT COUNT(*) AS n FROM (
      SELECT person_id FROM ekodi_mission_recurring_participation
        WHERE board_id=? AND enabled=1
      UNION
      SELECT person_id FROM ekodi_mission_saturday_private_rsvp
        WHERE board_id=? AND meeting_date=? AND attendance='join'
    ) people LEFT JOIN ekodi_mission_saturday_private_rsvp override
      ON override.board_id=? AND override.meeting_date=? AND override.person_id=people.person_id
    WHERE COALESCE(override.attendance,'join')='join'`)
      .bind(instance.board_id,instance.board_id,date,instance.board_id,date).first();
    response.managerSummary={privatePlannedJoin:Number(count?.n||0),verifiedAttendanceNotIncluded:true};
  }
  return boardJson(instance,response);
}

// Public read-only federation: each board owns its own posts and permissions.
// Only approved published schedule fields leave the board boundary.
export function parseEkodiPublicSchedule(row,today=missionKstToday()){
  if(!row||!['site:ekodichurch:main','site:ekodimission:main'].includes(row.board_id))return null;
  const source=row.board_id==='site:ekodichurch:main'?'ekodichurch':'ekodimission';
  const expected=source==='ekodichurch'?'schedule':'mission-schedule';
  if(row.category_id!==expected)return null;
  // Both boards retain their own write contract: Church's official editor stores
  // JSON, while Mission's official editor stores the two-line human-readable form.
  // Never return a whole body/description: only approved public schedule metadata.
  const raw=String(row.body||'');
  let date='',time='',venue='';
  if(raw.trimStart().startsWith('{')){
    try{
      const value=JSON.parse(raw);
      if(value&&typeof value==='object'&&!Array.isArray(value)){
        date=typeof value.date==='string'?value.date:'';
        time=typeof value.time==='string'?value.time:'';
        venue=typeof value.venue==='string'?value.venue.trim():'';
      }
    }catch{return null;}
  }else{
    const lines=raw.replace(/\r/g,'').split('\n');
    const when=lines[0]?.match(/^일정:\s*(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)$/);
    const place=lines[1]?.match(/^장소:\s*(.{1,160})$/);
    if(!when||!place)return null;
    date=when[1];time=when[2]+':'+when[3];venue=place[1].trim();
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||
    !venue||venue.length>160||date<today)return null;
  const parsed=new Date(date+'T00:00:00Z');
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return null;
  const id=Number(row.id),title=clean(row.title,160);
  if(!Number.isSafeInteger(id)||id<=0||!title)return null;
  return {id,source,sourceLabel:source==='ekodichurch'?'에코디교회':'에코디선교회',
    date,time,venue,title,url:'/'+source+'/board/post/'+id,kind:'official-post'};
}
// 에코디교회 주일예배: 매주 일요일 11:00 에코디교회. 특정 주일의 장소 변경은 아래 날짜표에 둔다.
// 같은 날짜에 '주일'이 들어간 교회 공식 일정 게시글이 있으면 그 게시글이 우선한다.
export const CHURCH_SUNDAY_WORSHIP=Object.freeze({title:'주일예배',time:'11:00',venue:'에코디교회',weeks:4,
  venueOverrides:Object.freeze({'2026-11-08':'목포 평화광장'})});
// 교회 공식 단건 일정(관리자 일정 테이블이 준비되기 전까지 공개 주요일정에 직접 등록).
export const CHURCH_KEY_EVENTS=Object.freeze([
  Object.freeze({date:'2026-11-15',time:'12:30',title:'공동의회 (주일예배 후)',venue:'에코디교회'}),
]);
export function churchKeyEvents(today=missionKstToday(),events=CHURCH_KEY_EVENTS){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today)))return [];
  return events.filter(e=>e.date>=today).map(e=>({id:0,source:'ekodichurch',sourceLabel:'에코디교회',date:e.date,time:e.time,
    venue:e.venue,title:e.title,url:'/ekodichurch/schedule/',kind:'church-key-event'}));
}
export function churchSundayWorshipEvents(today=missionKstToday(),config=CHURCH_SUNDAY_WORSHIP){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today)))return [];
  const first=new Date(today+'T00:00:00Z');
  first.setUTCDate(first.getUTCDate()+(7-first.getUTCDay())%7);
  return Array.from({length:config.weeks},(_,week)=>{
    const day=new Date(first);day.setUTCDate(first.getUTCDate()+week*7);
    const date=day.toISOString().slice(0,10);
    return {id:0,source:'ekodichurch',sourceLabel:'에코디교회',date,time:config.time,
      venue:config.venueOverrides[date]||config.venue,title:config.title,
      url:'/ekodichurch/#worship',kind:'recurring-worship'};
  });
}
// 관리자 '일정'(church.events)에 등록된 공개 가능 일정. 실패해도 주요일정 화면은 계속 보여준다.
export function churchAdminEventItems(rows){
  if(!Array.isArray(rows))return [];
  return rows.map(r=>{
    const date=String(r?.event_date||''),time=String(r?.event_time||'').slice(0,5)||'00:00',title=clean(r?.title,160);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!title)return null;
    return {id:0,source:'ekodichurch',sourceLabel:'에코디교회',date,time,venue:clean(r?.location,160)||'에코디교회',
      title,url:'/ekodichurch/schedule/',kind:'church-admin-event'};
  }).filter(Boolean);
}
async function readChurchAdminEvents(){
  try{
    const r=await fetch(`${CENTRAL_SUPABASE_URL}/rest/v1/rpc/church_public_events`,{method:'POST',
      headers:{apikey:CENTRAL_PUBLISHABLE_KEY,authorization:`Bearer ${CENTRAL_PUBLISHABLE_KEY}`,'content-type':'application/json'},
      body:JSON.stringify({p_church_slug:'ekodi-church',p_limit:30}),cache:'no-store',signal:AbortSignal.timeout(4000)});
    return r.ok?churchAdminEventItems(await r.json().catch(()=>[])):[];
  }catch{return [];}
}
async function readSharedPublicSchedules(env,instance){
  const today=missionKstToday(),missionId=boardId('ekodimission'),churchId=boardId('ekodichurch');
  const sql=[
    'SELECT p.id,p.board_id,p.title,p.body,pc.category_id FROM ekodi_board_posts p',
    'JOIN ekodi_board_post_categories pc ON pc.board_id=p.board_id AND pc.post_id=p.id',
    'JOIN ekodi_board_instances b ON b.board_id=p.board_id',
    "WHERE p.status='published' AND b.status='active' AND b.visibility='public'",
    "AND ((p.board_id=? AND pc.category_id='mission-schedule') OR (p.board_id=? AND pc.category_id='schedule'))",
    'ORDER BY p.updated_at DESC,p.id DESC LIMIT 200'
  ].join(' ');
  const rows=await env.DB.prepare(sql).bind(missionId,churchId).all();
  const items=(rows.results||[]).map(row=>parseEkodiPublicSchedule(row,today)).filter(Boolean);
  await missionEnsureWeeklyDates(env,missionId,today,missionSaturdayFor(today));
  const weekly=await env.DB.prepare(
    "SELECT meeting_date,starts_at,venue,title,status FROM ekodi_mission_saturday_events WHERE board_id=? AND meeting_date>=? AND status='scheduled' ORDER BY meeting_date LIMIT 4"
  ).bind(missionId,today).all();
  for(const event of weekly.results||[]){
    const date=String(event.meeting_date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||items.some(item=>item.source==='ekodimission'&&item.date===date&&item.title===event.title))continue;
    items.push({id:0,source:'ekodimission',sourceLabel:'에코디선교회',date,
      time:String(event.starts_at||'11:00'),venue:String(event.venue||'에코디교회'),
      title:String(event.title||'토요 성경토론과 식사'),
      url:'/ekodimission?meeting='+encodeURIComponent(date)+'#saturday',kind:'recurring-meeting'});
  }
  for(const event of [...await readChurchAdminEvents(),...churchKeyEvents(today)]){
    if(!items.some(item=>item.source==='ekodichurch'&&item.date===event.date&&item.title===event.title))items.push(event);
  }
  for(const event of churchSundayWorshipEvents(today)){
    if(items.some(item=>item.source==='ekodichurch'&&item.date===event.date&&item.kind==='official-post'&&/주일/.test(item.title)))continue;
    items.push(event);
  }
  items.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.source.localeCompare(b.source));
  return boardJson(instance,{ok:true,mode:'published-read-only',items:items.slice(0,30)});
}
// Return only anonymous aggregates; never expose private RSVP rows, names or member identities.
// A date-specific override has priority over an ongoing recurring setting and public reply.
export async function missionSaturdayPublicSummary(env,boardId,date){
  const planned=await env.DB.prepare(`WITH candidates(person_id) AS (
    SELECT person_id FROM ekodi_mission_recurring_participation WHERE board_id=? AND enabled=1
    UNION
    SELECT person_id FROM ekodi_mission_saturday_private_rsvp WHERE board_id=? AND meeting_date=? AND attendance='join'
    UNION
    SELECT author_person_id FROM ekodi_mission_saturday_replies WHERE board_id=? AND meeting_date=? AND status='published' AND attendance='join'
  )
  SELECT COUNT(*) AS n FROM candidates c
    LEFT JOIN ekodi_mission_saturday_private_rsvp o ON o.board_id=? AND o.meeting_date=? AND o.person_id=c.person_id
    LEFT JOIN ekodi_mission_recurring_participation r ON r.board_id=? AND r.person_id=c.person_id
    LEFT JOIN ekodi_mission_saturday_replies p ON p.board_id=? AND p.meeting_date=? AND p.author_person_id=c.person_id AND p.status='published'
  WHERE CASE
    WHEN o.attendance IN ('cancel','maybe') THEN 0
    WHEN o.attendance='join' THEN 1
    WHEN p.attendance='cancel' THEN 0
    WHEN r.enabled=1 THEN 1
    WHEN p.attendance='join' THEN 1
    ELSE 0 END=1`)
    .bind(boardId,boardId,date,boardId,date,boardId,date,boardId,boardId,date).first();
  const comments=await env.DB.prepare(`SELECT COUNT(*) AS n FROM ekodi_mission_saturday_replies
    WHERE board_id=? AND meeting_date=? AND status='published' AND length(trim(COALESCE(body,'')))>0`)
    .bind(boardId,date).first();
  return {plannedJoin:Number(planned?.n||0),comments:Number(comments?.n||0)};
}
async function missionSaturdayBoard(request,env,instance,who,method){
  const today=missionKstToday(),date=missionSaturdayFor(today);
  const stamp=now();
  await missionEnsureWeeklyDates(env,instance.board_id,today,date);
  const meeting=await env.DB.prepare(`SELECT meeting_date,starts_at,venue,title,status
    FROM ekodi_mission_saturday_events WHERE board_id=? AND meeting_date=? LIMIT 1`)
    .bind(instance.board_id,date).first();
  if(method==='POST'){
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)return boardJson(instance,{error:'origin_not_allowed'},403);
    if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
    if(meeting?.status!=='scheduled')return boardJson(instance,{error:'meeting_not_open'},409);
    const length=Number(request.headers.get('content-length')||0);
    if(length>4096)return boardJson(instance,{error:'payload_too_large'},413);
    const body=await parseBody(request);
    if(body?.meetingDate!==date)return boardJson(instance,{error:'meeting_date_changed',meetingDate:date},409);
    if(body?.publicConsent!==true)return boardJson(instance,{error:'public_consent_required'},400);
    const displayName=clean(body?.displayName,30),reply=clean(body?.body,500);
    const attendance=lower(body?.attendance);
    if(displayName.length<2||!['join','question','cancel'].includes(attendance))return boardJson(instance,{error:'invalid_reply'},400);
    if(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(reply)||/(?:01[016789])[\s-]?\d{3,4}[\s-]?\d{4}/.test(reply))return boardJson(instance,{error:'private_information_in_public_reply'},400);
    await env.DB.prepare(`INSERT INTO ekodi_mission_saturday_replies
      (board_id,meeting_date,author_person_id,display_name,body,attendance,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(board_id,meeting_date,author_person_id) DO UPDATE
      SET display_name=excluded.display_name,body=excluded.body,attendance=excluded.attendance,
      status='published',updated_at=excluded.updated_at`)
      .bind(instance.board_id,date,who.personId,displayName,reply,attendance,stamp,stamp).run();
    await audit(env,instance,who,'saturday.reply.upsert','saturday',date,{attendance});
  }else if(method!=='GET')return boardJson(instance,{error:'method_not_allowed'},405);
  const result=await env.DB.prepare(`SELECT id,author_person_id,display_name,body,attendance,created_at,updated_at
    FROM ekodi_mission_saturday_replies WHERE board_id=? AND meeting_date=? AND status='published'
    ORDER BY created_at,id LIMIT 200`).bind(instance.board_id,date).all();
  const replies=(result.results||[]).map(row=>({
    id:Number(row.id),displayName:row.display_name,body:row.body,attendance:row.attendance,
    createdAt:row.created_at,updatedAt:row.updated_at,own:who.authenticated&&row.author_person_id===who.personId
  }));
  const summary=await missionSaturdayPublicSummary(env,instance.board_id,date);
  return boardJson(instance,{
    ok:true,meeting:{date:meeting.meeting_date,time:meeting.starts_at,venue:meeting.venue,title:meeting.title,status:meeting.status},
    summary,replies,me:{authenticated:who.authenticated,displayName:replies.find(item=>item.own)?.displayName||'',role:who.role}
  });
}

export async function handleSiteBoardRequest(request,env){
  let route=resolveSiteBoardRoute(request.url);
  if(!route)route=await dynamicDomainRoute(request,env);
  if(!route)return null;
  const instance=await ensureInstance(env,route);
  if(!instance)return new Response('Board unavailable',{status:503,headers:{'cache-control':'no-store'}});
  const method=request.method.toUpperCase(),sub=route.subPath.replace(/\/+$/,'')||'/';
  const who=await actor(request,env,instance);
  if(['ekodichurch','ekodimission'].includes(route.siteId)&&sub==='/api/shared-schedules'){
    if(method!=='GET')return boardJson(instance,{error:'method_not_allowed'},405);
    const otherSite=route.siteId==='ekodichurch'?'ekodimission':'ekodichurch';
    await ensureInstance(env,{siteId:otherSite,tenantSlug:otherSite});
    return readSharedPublicSchedules(env,instance);
  }
  if(route.siteId==='ekodimission'&&sub==='/api/saturday/history'){
    return missionSaturdayHistory(request,env,instance,method);
  }
  if(route.siteId==='ekodimission'&&sub==='/api/saturday'){
    return missionSaturdayBoard(request,env,instance,who,method);
  }
  if(route.siteId==='ekodimission'&&sub==='/api/saturday/participation'){
    return missionSaturdayParticipation(request,env,instance,who,method);
  }
  if(method==='GET'&&sub==='/api/me'){
    const response=boardJson(instance,{
      authenticated:who.authenticated,role:who.role,manage:who.manage,
      account:who.authenticated?who.email:''
    });
    response.headers.set('cache-control','private, no-store');
    return response;
  }

  if(method==='POST'&&sub==='/api/memberships/bootstrap'){
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM ekodi_board_memberships WHERE board_id=?').bind(instance.board_id).first();
    if(Number(count?.n||0)>0)return boardJson(instance,{error:'board_membership_already_initialized'},409);
    if(!who.authenticated)return boardJson(instance,{error:'ekodi_authentication_required'},401);
    const gate=await verifySuperAdminReauth(request,env,instance,'board.membership.bootstrap');
    if(!gate.ok)return boardJson(instance,{error:gate.error},gate.status);
    const stamp=now();
    await env.DB.prepare(`INSERT INTO ekodi_board_memberships(board_id,person_id,role,status,created_at,updated_at)
      VALUES (?,?,?,'active',?,?)`).bind(instance.board_id,who.personId,'owner',stamp,stamp).run();
    await audit(env,instance,who,'membership.bootstrap','board',instance.board_id,{role:'owner'});
    return boardJson(instance,{ok:true,role:'owner'},201);
  }

  if(method==='POST'&&sub==='/api/lifecycle/cancel'){
    const gate=await verifySuperAdminReauth(request,env,instance,'board.lifecycle.cancel');
    if(!gate.ok)return boardJson(instance,{error:gate.error},gate.status);
    const lifecycleActor={...who,personId:gate.data?.actor||who.personId||'super_admin_reauth'};
    const snapshotId=await snapshotBoard(env,instance,lifecycleActor,'lifecycle.cancel');
    await env.DB.prepare(`UPDATE ekodi_board_instances SET status='cancelled',updated_at=? WHERE board_id=?`).bind(now(),instance.board_id).run();
    await audit(env,instance,lifecycleActor,'board.cancel','board',instance.board_id,{snapshotId,reauthenticated:true});
    return boardJson(instance,{ok:true,status:'cancelled',snapshotId});
  }

  if(method==='DELETE'&&sub==='/api/lifecycle'){
    const gate=await verifySuperAdminReauth(request,env,instance,'board.lifecycle.delete');
    if(!gate.ok)return boardJson(instance,{error:gate.error},gate.status);
    const lifecycleActor={...who,personId:gate.data?.actor||who.personId||'super_admin_reauth'};
    const snapshotId=await snapshotBoard(env,instance,lifecycleActor,'lifecycle.delete');
    await env.DB.prepare(`UPDATE ekodi_board_instances SET status='deleted',updated_at=? WHERE board_id=?`).bind(now(),instance.board_id).run();
    await audit(env,instance,lifecycleActor,'board.delete','board',instance.board_id,{snapshotId,physicalPurge:false,reauthenticated:true});
    return boardJson(instance,{ok:true,status:'deleted',snapshotId,physicalPurge:false});
  }

  if(method==='POST'&&sub==='/api/lifecycle/restore'){
    const gate=await verifySuperAdminReauth(request,env,instance,'board.lifecycle.restore');
    if(!gate.ok)return boardJson(instance,{error:gate.error},gate.status);
    const latest=await env.DB.prepare('SELECT id FROM ekodi_board_snapshots WHERE board_id=? ORDER BY id DESC LIMIT 1').bind(instance.board_id).first();
    if(!latest)return boardJson(instance,{error:'restore_snapshot_required'},409);
    const lifecycleActor={...who,personId:gate.data?.actor||who.personId||'super_admin_reauth'};
    await env.DB.prepare(`UPDATE ekodi_board_instances SET status='active',updated_at=? WHERE board_id=?`).bind(now(),instance.board_id).run();
    await audit(env,instance,lifecycleActor,'board.restore','board',instance.board_id,{snapshotId:Number(latest.id),reauthenticated:true});
    return boardJson(instance,{ok:true,status:'active',snapshotId:Number(latest.id)});
  }

  if(instance.status!=='active')return boardJson(instance,{error:'board_unavailable',status:instance.status},410);

  // A members-only board must never expose posts, comments, attachments, search,
  // or mutable operations to a logged-in person without an active board membership.
  // Keep the health identity and non-sensitive visibility config publicly readable.
  if(instance.visibility==='members'&&!who.boardMember&&sub!=='/api/health'&&sub!=='/api/config'){
    return boardJson(instance,{error:who.authenticated?'board_membership_required':'authentication_required'},who.authenticated?403:401);
  }

  if(method==='GET'&&sub==='/api/memberships'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const rows=await env.DB.prepare('SELECT person_id,role,status,created_at,updated_at FROM ekodi_board_memberships WHERE board_id=? ORDER BY role,person_id').bind(instance.board_id).all();
    return boardJson(instance,{items:rows.results||[]});
  }
  if(method==='PUT'&&sub==='/api/memberships'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const body=await parseBody(request)||{};
    const personId=clean(body.personId,160),role=lower(body.role);
    if(!personId||!['owner','admin','moderator','member'].includes(role))return boardJson(instance,{error:'invalid_membership'},400);
    if(who.role!=='owner'&&role==='owner')return boardJson(instance,{error:'owner_role_requires_owner'},403);
    const stamp=now();
    await env.DB.prepare(`INSERT INTO ekodi_board_memberships(board_id,person_id,role,status,created_at,updated_at)
      VALUES (?,?,?,'active',?,?)
      ON CONFLICT(board_id,person_id) DO UPDATE SET role=excluded.role,status='active',updated_at=excluded.updated_at`)
      .bind(instance.board_id,personId,role,stamp,stamp).run();
    await audit(env,instance,who,'membership.upsert','person',personId,{role});
    return boardJson(instance,{ok:true,personId,role});
  }
  if(method==='DELETE'&&sub==='/api/memberships'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const body=await parseBody(request)||{};
    const personId=clean(body.personId,160);
    if(!personId)return boardJson(instance,{error:'person_id_required'},400);
    const target=await env.DB.prepare('SELECT role FROM ekodi_board_memberships WHERE board_id=? AND person_id=? AND status=? LIMIT 1').bind(instance.board_id,personId,'active').first();
    if(!target)return boardJson(instance,{error:'not_found'},404);
    if(lower(target.role)==='owner'){
      const owners=await env.DB.prepare("SELECT COUNT(*) AS n FROM ekodi_board_memberships WHERE board_id=? AND status='active' AND role='owner'").bind(instance.board_id).first();
      if(Number(owners?.n||0)<=1)return boardJson(instance,{error:'last_owner_cannot_be_removed'},409);
      if(who.role!=='owner')return boardJson(instance,{error:'owner_role_requires_owner'},403);
    }
    await env.DB.prepare("UPDATE ekodi_board_memberships SET status='revoked',updated_at=? WHERE board_id=? AND person_id=?").bind(now(),instance.board_id,personId).run();
    await audit(env,instance,who,'membership.revoke','person',personId,{role:target.role});
    return boardJson(instance,{ok:true});
  }

  if(method==='GET'&&sub==='/'){
    const categoryId=safeCategoryId(new URL(request.url).searchParams.get('category'));
    const selected=isPublicOfficialCategory(instance,categoryId)?categoryId:'';
    return page(route,await listPosts(env,instance,selected),selected);
  }
  const postPageMatch=sub.match(/^\/post\/(\d+)$/);
  if(method==='GET'&&postPageMatch)return postPage(route,await readPost(env,instance,Number(postPageMatch[1])));
  if(method==='GET'&&sub==='/api/health')return boardJson(instance,{ok:true,boardId:instance.board_id,siteId:instance.site_id,aiIndependent:true,independent:true});
  if(method==='GET'&&sub==='/api/posts'){
    const categoryId=safeCategoryId(new URL(request.url).searchParams.get('category'));
    const selected=isPublicOfficialCategory(instance,categoryId)?categoryId:'';
    return boardJson(instance,{boardId:instance.board_id,categoryId:selected||null,items:await listPosts(env,instance,selected)});
  }
  const apiPost=sub.match(/^\/api\/posts\/(\d+)$/);
  if(method==='GET'&&apiPost){
    const post=await readPost(env,instance,Number(apiPost[1]));
    return post?boardJson(instance,post):boardJson(instance,{error:'not_found'},404);
  }

  if(method==='POST'&&sub==='/api/posts'){
    if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
    const body=await parseBody(request),title=clean(body?.title,200),textBody=clean(body?.body,20000);
    if(churchOfficialCategoryRequiresManager(route.siteId,body?.categoryId)&&!who.manage)return boardJson(instance,{error:'official_category_requires_board_manager'},403);
    if(!title||!textBody)return boardJson(instance,{error:'title_and_body_required'},400);
    const categoryId=safeCategoryId(body?.categoryId);
    if(isMissionOfficialCategory(instance,categoryId)&&!who.manage)return boardJson(instance,{error:'official_post_manager_required'},403);
    const stamp=now();
    const result=await env.DB.prepare(`INSERT INTO ekodi_board_posts
      (board_id,author_person_id,author_email,title,body,status,created_at,updated_at) VALUES (?,?,?,?,?,'published',?,?)`)
      .bind(instance.board_id,who.personId,who.email,title,textBody,stamp,stamp).run();
    const id=Number(result?.meta?.last_row_id||0);
    if(categoryId){
      const official=isPublicOfficialCategory(instance,categoryId);
      const category=official||await env.DB.prepare("SELECT category_id FROM ekodi_board_categories WHERE board_id=? AND category_id=? AND status='active' LIMIT 1").bind(instance.board_id,categoryId).first();
      if(category)await env.DB.prepare('INSERT OR IGNORE INTO ekodi_board_post_categories(board_id,post_id,category_id) VALUES (?,?,?)').bind(instance.board_id,id,categoryId).run();
    }
    await audit(env,instance,who,'post.create','post',id,{categoryId:categoryId||null});
    return boardJson(instance,{ok:true,id,categoryId:categoryId||null},201);
  }
  if(apiPost&&['PATCH','DELETE'].includes(method)){
    if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
    const id=Number(apiPost[1]);
    const existing=await env.DB.prepare('SELECT * FROM ekodi_board_posts WHERE board_id=? AND id=? LIMIT 1').bind(instance.board_id,id).first();
    if(!existing)return boardJson(instance,{error:'not_found'},404);
    // Even a previous author cannot alter or delete an official Church item without the editor role.
    if(route.siteId==='ekodichurch'&&!who.manage){
      const tagged=await env.DB.prepare("SELECT category_id FROM ekodi_board_post_categories WHERE board_id=? AND post_id=? AND category_id IN ('notice','schedule') LIMIT 1").bind(instance.board_id,id).first();
      if(churchOfficialCategoryRequiresManager(route.siteId,tagged?.category_id))return boardJson(instance,{error:'official_category_requires_board_manager'},403);
    }
    const owns=clean(existing.author_person_id,160)===who.personId;
    if(!owns&&!who.manage)return boardJson(instance,{error:'forbidden'},403);
    if(instance.site_id==='ekodimission'&&!who.manage){
      const protectedCategory=await env.DB.prepare("SELECT category_id FROM ekodi_board_post_categories WHERE board_id=? AND post_id=? AND category_id IN ('mission-notice','mission-schedule') LIMIT 1").bind(instance.board_id,id).first();
      if(protectedCategory)return boardJson(instance,{error:'official_post_manager_required'},403);
    }
    if(method==='DELETE'){
      await env.DB.prepare(`UPDATE ekodi_board_posts SET status='deleted',updated_at=? WHERE board_id=? AND id=?`).bind(now(),instance.board_id,id).run();
      await audit(env,instance,who,'post.delete','post',id);
      return boardJson(instance,{ok:true});
    }
    const body=await parseBody(request),title=clean(body?.title??existing.title,200),textBody=clean(body?.body??existing.body,20000);
    if(churchOfficialCategoryRequiresManager(route.siteId,body?.categoryId)&&!who.manage)return boardJson(instance,{error:'official_category_requires_board_manager'},403);
    if(!title||!textBody)return boardJson(instance,{error:'title_and_body_required'},400);
    if(isMissionOfficialCategory(instance,safeCategoryId(body?.categoryId))&&!who.manage)return boardJson(instance,{error:'official_post_manager_required'},403);
    await env.DB.prepare('UPDATE ekodi_board_posts SET title=?,body=?,updated_at=? WHERE board_id=? AND id=?').bind(title,textBody,now(),instance.board_id,id).run();
    if(body?.categoryId!==undefined){
      await env.DB.prepare('DELETE FROM ekodi_board_post_categories WHERE board_id=? AND post_id=?').bind(instance.board_id,id).run();
      const categoryId=safeCategoryId(body.categoryId);
      if(categoryId){
        const category=isPublicOfficialCategory(instance,categoryId)||await env.DB.prepare("SELECT category_id FROM ekodi_board_categories WHERE board_id=? AND category_id=? AND status='active' LIMIT 1").bind(instance.board_id,categoryId).first();
        if(category)await env.DB.prepare('INSERT OR IGNORE INTO ekodi_board_post_categories(board_id,post_id,category_id) VALUES (?,?,?)').bind(instance.board_id,id,categoryId).run();
      }
    }
    await audit(env,instance,who,'post.edit','post',id,{categoryId:body?.categoryId??undefined});
    return boardJson(instance,{ok:true});
  }
  const commentsMatch=sub.match(/^\/api\/posts\/(\d+)\/comments$/);
  if(method==='GET'&&commentsMatch){
    const id=Number(commentsMatch[1]),post=await readPost(env,instance,id);
    return post?boardJson(instance,{items:post.comments}):boardJson(instance,{error:'not_found'},404);
  }
  if(method==='POST'&&commentsMatch){
    if(Number(instance.comments_enabled)!==1)return boardJson(instance,{error:'comments_disabled'},409);
    if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
    const id=Number(commentsMatch[1]);
    const exists=await env.DB.prepare(`SELECT id FROM ekodi_board_posts WHERE board_id=? AND id=? AND status='published' LIMIT 1`).bind(instance.board_id,id).first();
    if(!exists)return boardJson(instance,{error:'not_found'},404);
    const body=await parseBody(request),comment=clean(body?.body,5000);
    if(!comment)return boardJson(instance,{error:'body_required'},400);
    const stamp=now();
    const result=await env.DB.prepare(`INSERT INTO ekodi_board_comments
      (board_id,post_id,author_person_id,author_email,body,status,created_at,updated_at) VALUES (?,?,?,?,?,'published',?,?)`)
      .bind(instance.board_id,id,who.personId,who.email,comment,stamp,stamp).run();
    const commentId=Number(result?.meta?.last_row_id||0);
    await audit(env,instance,who,'comment.create','comment',commentId,{postId:id});
    return boardJson(instance,{ok:true,id:commentId},201);
  }
  if(method==='GET'&&sub==='/api/search'){
    const url=new URL(request.url),q=clean(url.searchParams.get('q'),120);
    if(!q)return boardJson(instance,{query:'',items:[]});
    const like=`%${q}%`;
    const rows=await env.DB.prepare(`SELECT p.id,p.title,p.body,p.created_at,p.updated_at,
        (SELECT pc.category_id FROM ekodi_board_post_categories pc WHERE pc.board_id=p.board_id AND pc.post_id=p.id ORDER BY pc.category_id LIMIT 1) AS category_id
      FROM ekodi_board_posts p WHERE p.board_id=? AND p.status='published' AND (p.title LIKE ? OR p.body LIKE ?)
      ORDER BY p.created_at DESC,p.id DESC LIMIT 50`).bind(instance.board_id,like,like).all();
    return boardJson(instance,{query:q,items:(rows.results||[]).map(publicPost)});
  }
  if(method==='GET'&&sub==='/api/categories'){
    const rows=await env.DB.prepare("SELECT category_id,name,sort_order,created_at,updated_at FROM ekodi_board_categories WHERE board_id=? AND status='active' ORDER BY sort_order,name").bind(instance.board_id).all();
    return boardJson(instance,{items:rows.results||[]});
  }
  if(method==='PUT'&&sub==='/api/categories'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const body=await parseBody(request)||{},categoryId=safeCategoryId(body.categoryId||body.name),name=clean(body.name,120),sortOrder=Math.max(0,Math.min(9999,Number(body.sortOrder)||0)),stamp=now();
    if(!categoryId||!name)return boardJson(instance,{error:'category_id_and_name_required'},400);
    await env.DB.prepare(`INSERT INTO ekodi_board_categories(board_id,category_id,name,sort_order,status,created_at,updated_at)
      VALUES (?,?,?,?,'active',?,?) ON CONFLICT(board_id,category_id) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order,status='active',updated_at=excluded.updated_at`)
      .bind(instance.board_id,categoryId,name,sortOrder,stamp,stamp).run();
    await audit(env,instance,who,'category.upsert','category',categoryId,{name,sortOrder});
    return boardJson(instance,{ok:true,categoryId,name,sortOrder});
  }
  const categoryMatch=sub.match(/^\/api\/categories\/([a-z0-9._-]+)$/);
  if(method==='DELETE'&&categoryMatch){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const categoryId=safeCategoryId(categoryMatch[1]);
    await env.DB.prepare("UPDATE ekodi_board_categories SET status='archived',updated_at=? WHERE board_id=? AND category_id=?").bind(now(),instance.board_id,categoryId).run();
    await env.DB.prepare('DELETE FROM ekodi_board_post_categories WHERE board_id=? AND category_id=?').bind(instance.board_id,categoryId).run();
    await audit(env,instance,who,'category.archive','category',categoryId);
    return boardJson(instance,{ok:true});
  }
  const attachmentPostMatch=sub.match(/^\/api\/posts\/(\d+)\/attachments$/);
  if(method==='GET'&&attachmentPostMatch){
    const postId=Number(attachmentPostMatch[1]);
    const rows=await env.DB.prepare("SELECT * FROM ekodi_board_attachments WHERE board_id=? AND post_id=? AND status='active' ORDER BY id").bind(instance.board_id,postId).all();
    return boardJson(instance,{items:(rows.results||[]).map(publicAttachment)});
  }
  if(method==='POST'&&attachmentPostMatch){
    if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
    const postId=Number(attachmentPostMatch[1]);
    const post=await env.DB.prepare("SELECT author_person_id FROM ekodi_board_posts WHERE board_id=? AND id=? AND status='published' LIMIT 1").bind(instance.board_id,postId).first();
    if(!post)return boardJson(instance,{error:'not_found'},404);
    const owns=clean(post.author_person_id,160)===who.personId;
    if(!owns&&!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const body=await parseBody(request)||{},name=clean(body.name,240),url=safeAttachmentUrl(body.url),mimeType=clean(body.mimeType,120),sizeBytes=Math.max(0,Math.min(100000000,Number(body.sizeBytes)||0));
    if(!name||!url)return boardJson(instance,{error:'attachment_name_and_https_url_required'},400);
    const stamp=now();
    const result=await env.DB.prepare(`INSERT INTO ekodi_board_attachments(board_id,post_id,uploader_person_id,name,url,mime_type,size_bytes,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'active',?,?)`).bind(instance.board_id,postId,who.personId,name,url,mimeType,sizeBytes,stamp,stamp).run();
    const id=Number(result?.meta?.last_row_id||0);
    await audit(env,instance,who,'attachment.create','attachment',id,{postId,name});
    return boardJson(instance,{ok:true,id,postId,name,url},201);
  }
  const attachmentMatch=sub.match(/^\/api\/attachments\/(\d+)$/);
  if(method==='DELETE'&&attachmentMatch){
    if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
    const id=Number(attachmentMatch[1]);
    const attachment=await env.DB.prepare("SELECT uploader_person_id FROM ekodi_board_attachments WHERE board_id=? AND id=? AND status='active' LIMIT 1").bind(instance.board_id,id).first();
    if(!attachment)return boardJson(instance,{error:'not_found'},404);
    const owns=clean(attachment.uploader_person_id,160)===who.personId;
    if(!owns&&!who.manage)return boardJson(instance,{error:'forbidden'},403);
    await env.DB.prepare("UPDATE ekodi_board_attachments SET status='deleted',updated_at=? WHERE board_id=? AND id=?").bind(now(),instance.board_id,id).run();
    await audit(env,instance,who,'attachment.delete','attachment',id);
    return boardJson(instance,{ok:true});
  }
  const commentItemMatch=sub.match(/^\/api\/comments\/(\d+)$/);
  if(commentItemMatch&&['PATCH','DELETE'].includes(method)){
    if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
    const id=Number(commentItemMatch[1]);
    const existing=await env.DB.prepare("SELECT * FROM ekodi_board_comments WHERE board_id=? AND id=? AND status='published' LIMIT 1").bind(instance.board_id,id).first();
    if(!existing)return boardJson(instance,{error:'not_found'},404);
    const owns=clean(existing.author_person_id,160)===who.personId;
    if(!owns&&!who.manage)return boardJson(instance,{error:'forbidden'},403);
    if(method==='DELETE'){
      await env.DB.prepare("UPDATE ekodi_board_comments SET status='deleted',updated_at=? WHERE board_id=? AND id=?").bind(now(),instance.board_id,id).run();
      await audit(env,instance,who,'comment.delete','comment',id);
      return boardJson(instance,{ok:true});
    }
    const body=await parseBody(request)||{},comment=clean(body.body??existing.body,5000);
    if(!comment)return boardJson(instance,{error:'body_required'},400);
    await env.DB.prepare('UPDATE ekodi_board_comments SET body=?,updated_at=? WHERE board_id=? AND id=?').bind(comment,now(),instance.board_id,id).run();
    await audit(env,instance,who,'comment.edit','comment',id);
    return boardJson(instance,{ok:true});
  }
  if(method==='GET'&&sub==='/api/snapshots'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const rows=await env.DB.prepare('SELECT id,reason,created_by,created_at FROM ekodi_board_snapshots WHERE board_id=? ORDER BY id DESC LIMIT 50').bind(instance.board_id).all();
    return boardJson(instance,{items:rows.results||[]});
  }
  if(method==='POST'&&sub==='/api/snapshots'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const body=await parseBody(request)||{},reason=clean(body.reason||'manual.backup',120);
    const snapshotId=await snapshotBoard(env,instance,who,reason);
    await audit(env,instance,who,'snapshot.create','snapshot',snapshotId,{reason});
    return boardJson(instance,{ok:true,snapshotId},201);
  }
  if(method==='GET'&&sub==='/api/config')return boardJson(instance,{siteId:instance.site_id,visibility:instance.visibility,allowAnonymousWrite:false,commentsEnabled:Number(instance.comments_enabled)===1});
  if(method==='PATCH'&&sub==='/api/config'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const body=await parseBody(request)||{};
    const visibility=['public','members'].includes(lower(body.visibility))?lower(body.visibility):instance.visibility;
    if(body.allowAnonymousWrite!==undefined&&body.allowAnonymousWrite!==false)return boardJson(instance,{error:'anonymous_writes_disabled'},400);
    const anonymous=0; // Legacy DB flag is write-disabled and normalized by authorized config updates.
    const comments=body.commentsEnabled===undefined?Number(instance.comments_enabled):(body.commentsEnabled?1:0);
    await env.DB.prepare('UPDATE ekodi_board_instances SET visibility=?,allow_anonymous_write=?,comments_enabled=?,updated_at=? WHERE board_id=?')
      .bind(visibility,anonymous,comments,now(),instance.board_id).run();
    await audit(env,instance,who,'config.update','board',instance.board_id,{visibility,anonymous,comments});
    return boardJson(instance,{ok:true});
  }
  if(method==='GET'&&sub==='/api/export'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const [posts,comments,memberships,categories,postCategories,attachments]=await Promise.all([
      env.DB.prepare('SELECT * FROM ekodi_board_posts WHERE board_id=? ORDER BY id').bind(instance.board_id).all(),
      env.DB.prepare('SELECT * FROM ekodi_board_comments WHERE board_id=? ORDER BY id').bind(instance.board_id).all(),
      env.DB.prepare('SELECT person_id,role,status,created_at,updated_at FROM ekodi_board_memberships WHERE board_id=? ORDER BY person_id').bind(instance.board_id).all(),
      env.DB.prepare('SELECT * FROM ekodi_board_categories WHERE board_id=? ORDER BY sort_order,name').bind(instance.board_id).all(),
      env.DB.prepare('SELECT * FROM ekodi_board_post_categories WHERE board_id=? ORDER BY post_id,category_id').bind(instance.board_id).all(),
      env.DB.prepare('SELECT * FROM ekodi_board_attachments WHERE board_id=? ORDER BY id').bind(instance.board_id).all(),
    ]);
    return boardJson(instance,{schemaVersion:3,board:{boardId:instance.board_id,siteId:instance.site_id,tenantSlug:instance.tenant_slug,status:instance.status,config:instance.config_json},posts:posts.results||[],comments:comments.results||[],memberships:memberships.results||[],categories:categories.results||[],postCategories:postCategories.results||[],attachments:attachments.results||[]});
  }
  return boardJson(instance,{error:'not_found'},404);
}

export const EKODI_SITE_BOARD=Object.freeze({
  version:'1.2.0',
  canonicalSuffix:'/board',
  aiIndependent:true,
  siteScoped:true,
  exportable:true,
  sharedPlatformDependency:'authentication_identity_only',
  boardLocalAuthorization:true,
  lifecycleDestructiveReauth:true,
  coreOperations:Object.freeze(['list','read','create','edit','delete','comments','comment-edit','comment-delete','categories','attachments','search','config','snapshot','export','membership-bootstrap','membership-list','membership-upsert','membership-revoke','lifecycle-cancel','lifecycle-delete','lifecycle-restore']),
});
