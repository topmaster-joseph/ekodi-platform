import { principalFromSupabaseRequest } from './ekodi-principal.js';

const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
const lower=value=>clean(value,320).toLowerCase();
const json=(data,status=200,extraHeaders={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extraHeaders}});
const now=()=>new Date().toISOString();
const BOARD_MANAGE_ROLES=new Set(['owner','admin','moderator']);
const PATH_TENANT_ALIASES=Object.freeze({
  ekodimission:'ekodimission',
  ekodichurch:'ekodichurch',
  cheonggye:'cheonggye-local',
  cgma:'cheonggye',
  community:'community',
  seonammedi:'seonammedi',
});
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
  if(host==='ekodi.kr'){
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

async function actor(request,env,instance){
  const principal=await principalFromSupabaseRequest(request).catch(()=>null);
  if(!principal?.id)return Object.freeze({authenticated:false,personId:'',email:'',role:'anonymous',manage:false});
  const personId=clean(principal.subject?.key||principal.id,160);
  const email=lower(principal.email);
  const membership=await env.DB.prepare(`SELECT role,status FROM ekodi_board_memberships
    WHERE board_id=? AND person_id=? LIMIT 1`).bind(instance.board_id,personId).first().catch(()=>null);
  const role=membership?.status==='active'?(lower(membership.role)||'member'):'member';
  const manage=membership?.status==='active'&&BOARD_MANAGE_ROLES.has(role);
  return Object.freeze({authenticated:true,personId,email,role,manage});
}

async function verifySuperAdminReauth(request,env,instance,scope){
  if(!env?.CONTROL_API?.fetch)return {ok:false,status:503,error:'reauth_service_unavailable'};
  const proof=String(request.headers.get('x-ekodi-reauth-proof')||'').trim();
  const authorization=String(request.headers.get('authorization')||'');
  if(!proof||!authorization)return {ok:false,status:401,error:'super_admin_reauthentication_required'};
  const url=new URL(request.url);url.pathname='/api/reauth/verify';url.search='';url.hash='';
  const response=await env.CONTROL_API.fetch(new Request(url.toString(),{
    method:'POST',
    headers:{'content-type':'application/json','authorization':authorization,'x-ekodi-reauth-proof':proof},
    body:JSON.stringify({scope,resource:instance.board_id}),
  }));
  const data=await response.json().catch(()=>null);
  return response.ok&&data?.verified===true?{ok:true,data}:{ok:false,status:response.status||403,error:data?.error||'reauth_failed'};
}

async function snapshotBoard(env,instance,who,reason){
  const [posts,comments,memberships]=await Promise.all([
    env.DB.prepare('SELECT * FROM ekodi_board_posts WHERE board_id=? ORDER BY id').bind(instance.board_id).all(),
    env.DB.prepare('SELECT * FROM ekodi_board_comments WHERE board_id=? ORDER BY id').bind(instance.board_id).all(),
    env.DB.prepare('SELECT * FROM ekodi_board_memberships WHERE board_id=? ORDER BY person_id').bind(instance.board_id).all(),
  ]);
  const snapshot={schemaVersion:1,board:{...instance},posts:posts.results||[],comments:comments.results||[],memberships:memberships.results||[]};
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

function publicPost(row){return {id:Number(row.id),title:row.title,body:row.body,createdAt:row.created_at,updatedAt:row.updated_at};}
function publicComment(row){return {id:Number(row.id),postId:Number(row.post_id),body:row.body,createdAt:row.created_at,updatedAt:row.updated_at};}
const boardJson=(instance,data,status=200)=>json(data,status,{'x-ekodi-board-id':instance.board_id,'x-ekodi-board-independent':'true'});
async function parseBody(request){try{return await request.json()}catch{return null}}

async function listPosts(env,instance){
  const rows=await env.DB.prepare(`SELECT id,title,body,created_at,updated_at FROM ekodi_board_posts
    WHERE board_id=? AND status='published' ORDER BY created_at DESC,id DESC LIMIT 100`).bind(instance.board_id).all();
  return (rows.results||[]).map(publicPost);
}
async function readPost(env,instance,id){
  const post=await env.DB.prepare(`SELECT * FROM ekodi_board_posts WHERE board_id=? AND id=? AND status='published' LIMIT 1`).bind(instance.board_id,id).first();
  if(!post)return null;
  const comments=await env.DB.prepare(`SELECT id,post_id,body,created_at,updated_at FROM ekodi_board_comments
    WHERE board_id=? AND post_id=? AND status='published' ORDER BY created_at,id`).bind(instance.board_id,id).all();
  return {...publicPost(post),comments:(comments.results||[]).map(publicComment)};
}

function htmlEscape(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function page(route,posts){
  const items=posts.length?posts.map(post=>`<article><a href="${route.basePath}/post/${post.id}"><h2>${htmlEscape(post.title)}</h2></a><p>${htmlEscape(post.body).slice(0,220)}</p><time>${htmlEscape(post.createdAt)}</time></article>`).join(''):'<p class="empty">등록된 글이 없습니다.</p>';
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>게시판</title><style>body{margin:0;background:#fff;color:#111;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}main{width:min(920px,calc(100% - 28px));margin:0 auto;padding:18px 0}header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:12px 0}h1{font-size:22px;margin:0}article{padding:15px 0;border-bottom:1px solid #e6e6e6}h2{font-size:18px;margin:0 0 7px}a{color:#111;text-decoration:none}p{white-space:pre-wrap;line-height:1.5;margin:0 0 7px}time{font-size:12px;color:#666}.empty{padding:30px 0}</style></head><body><main><header><h1>게시판</h1></header>${items}</main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-ekodi-board-id':boardId(route.siteId),'x-ekodi-board-independent':'true'}});
}
function postPage(route,post){
  if(!post)return new Response('Not Found',{status:404});
  const comments=post.comments.map(c=>`<li>${htmlEscape(c.body)} <small>${htmlEscape(c.createdAt)}</small></li>`).join('');
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(post.title)}</title></head><body><main><p><a href="${route.basePath}">← 게시판</a></p><h1>${htmlEscape(post.title)}</h1><p style="white-space:pre-wrap">${htmlEscape(post.body)}</p><hr><ul>${comments}</ul></main></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-ekodi-board-id':boardId(route.siteId),'x-ekodi-board-independent':'true'}});
}

export async function handleSiteBoardRequest(request,env){
  let route=resolveSiteBoardRoute(request.url);
  if(!route)route=await dynamicDomainRoute(request,env);
  if(!route)return null;
  const instance=await ensureInstance(env,route);
  if(!instance)return new Response('Board unavailable',{status:503,headers:{'cache-control':'no-store'}});
  const method=request.method.toUpperCase(),sub=route.subPath.replace(/\/+$/,'')||'/';
  const who=await actor(request,env,instance);

  if(method==='POST'&&sub==='/api/memberships/bootstrap'){
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM ekodi_board_memberships WHERE board_id=?').bind(instance.board_id).first();
    if(Number(count?.n||0)>0)return boardJson(instance,{error:'board_membership_already_initialized'},409);
    const gate=await verifySuperAdminReauth(request,env,instance,'board.membership.bootstrap');
    if(!gate.ok)return boardJson(instance,{error:gate.error},gate.status);
    if(!who.authenticated)return boardJson(instance,{error:'ekodi_authentication_required'},401);
    const stamp=now();
    await env.DB.prepare(`INSERT INTO ekodi_board_memberships(board_id,person_id,role,status,created_at,updated_at)
      VALUES (?,?,?,'active',?,?)`).bind(instance.board_id,who.personId,'owner',stamp,stamp).run();
    await audit(env,instance,who,'membership.bootstrap','board',instance.board_id,{role:'owner'});
    return boardJson(instance,{ok:true,role:'owner'},201);
  }

  if(method==='POST'&&sub==='/api/lifecycle/cancel'){
    const gate=await verifySuperAdminReauth(request,env,instance,'board.lifecycle.cancel');
    if(!gate.ok)return boardJson(instance,{error:gate.error},gate.status);
    const snapshotId=await snapshotBoard(env,instance,who,'lifecycle.cancel');
    await env.DB.prepare(`UPDATE ekodi_board_instances SET status='cancelled',updated_at=? WHERE board_id=?`).bind(now(),instance.board_id).run();
    await audit(env,instance,who,'board.cancel','board',instance.board_id,{snapshotId});
    return boardJson(instance,{ok:true,status:'cancelled',snapshotId});
  }

  if(method==='DELETE'&&sub==='/api/lifecycle'){
    const gate=await verifySuperAdminReauth(request,env,instance,'board.lifecycle.delete');
    if(!gate.ok)return boardJson(instance,{error:gate.error},gate.status);
    const snapshotId=await snapshotBoard(env,instance,who,'lifecycle.delete');
    await env.DB.prepare(`UPDATE ekodi_board_instances SET status='deleted',updated_at=? WHERE board_id=?`).bind(now(),instance.board_id).run();
    await audit(env,instance,who,'board.delete','board',instance.board_id,{snapshotId,physicalPurge:false});
    return boardJson(instance,{ok:true,status:'deleted',snapshotId,physicalPurge:false});
  }

  if(instance.status!=='active')return boardJson(instance,{error:'board_unavailable',status:instance.status},410);

  if(method==='GET'&&sub==='/')return page(route,await listPosts(env,instance));
  const postPageMatch=sub.match(/^\/post\/(\d+)$/);
  if(method==='GET'&&postPageMatch)return postPage(route,await readPost(env,instance,Number(postPageMatch[1])));
  if(method==='GET'&&sub==='/api/health')return boardJson(instance,{ok:true,boardId:instance.board_id,siteId:instance.site_id,aiIndependent:true,independent:true});
  if(method==='GET'&&sub==='/api/posts')return boardJson(instance,{boardId:instance.board_id,items:await listPosts(env,instance)});
  const apiPost=sub.match(/^\/api\/posts\/(\d+)$/);
  if(method==='GET'&&apiPost){
    const post=await readPost(env,instance,Number(apiPost[1]));
    return post?boardJson(instance,post):boardJson(instance,{error:'not_found'},404);
  }

  if(method==='POST'&&sub==='/api/posts'){
    if(!who.authenticated&&Number(instance.allow_anonymous_write)!==1)return boardJson(instance,{error:'authentication_required'},401);
    const body=await parseBody(request),title=clean(body?.title,200),textBody=clean(body?.body,20000);
    if(!title||!textBody)return boardJson(instance,{error:'title_and_body_required'},400);
    const stamp=now();
    const result=await env.DB.prepare(`INSERT INTO ekodi_board_posts
      (board_id,author_person_id,author_email,title,body,status,created_at,updated_at) VALUES (?,?,?,?,?,'published',?,?)`)
      .bind(instance.board_id,who.personId,who.email,title,textBody,stamp,stamp).run();
    const id=Number(result?.meta?.last_row_id||0);
    await audit(env,instance,who,'post.create','post',id);
    return boardJson(instance,{ok:true,id},201);
  }
  if(apiPost&&['PATCH','DELETE'].includes(method)){
    if(!who.authenticated)return boardJson(instance,{error:'authentication_required'},401);
    const id=Number(apiPost[1]);
    const existing=await env.DB.prepare('SELECT * FROM ekodi_board_posts WHERE board_id=? AND id=? LIMIT 1').bind(instance.board_id,id).first();
    if(!existing)return boardJson(instance,{error:'not_found'},404);
    const owns=clean(existing.author_person_id,160)===who.personId;
    if(!owns&&!who.manage)return boardJson(instance,{error:'forbidden'},403);
    if(method==='DELETE'){
      await env.DB.prepare(`UPDATE ekodi_board_posts SET status='deleted',updated_at=? WHERE board_id=? AND id=?`).bind(now(),instance.board_id,id).run();
      await audit(env,instance,who,'post.delete','post',id);
      return boardJson(instance,{ok:true});
    }
    const body=await parseBody(request),title=clean(body?.title??existing.title,200),textBody=clean(body?.body??existing.body,20000);
    if(!title||!textBody)return boardJson(instance,{error:'title_and_body_required'},400);
    await env.DB.prepare('UPDATE ekodi_board_posts SET title=?,body=?,updated_at=? WHERE board_id=? AND id=?').bind(title,textBody,now(),instance.board_id,id).run();
    await audit(env,instance,who,'post.edit','post',id);
    return boardJson(instance,{ok:true});
  }
  const commentsMatch=sub.match(/^\/api\/posts\/(\d+)\/comments$/);
  if(method==='GET'&&commentsMatch){
    const id=Number(commentsMatch[1]),post=await readPost(env,instance,id);
    return post?boardJson(instance,{items:post.comments}):boardJson(instance,{error:'not_found'},404);
  }
  if(method==='POST'&&commentsMatch){
    if(Number(instance.comments_enabled)!==1)return boardJson(instance,{error:'comments_disabled'},409);
    if(!who.authenticated&&Number(instance.allow_anonymous_write)!==1)return boardJson(instance,{error:'authentication_required'},401);
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
  if(method==='GET'&&sub==='/api/config')return boardJson(instance,{siteId:instance.site_id,visibility:instance.visibility,allowAnonymousWrite:Number(instance.allow_anonymous_write)===1,commentsEnabled:Number(instance.comments_enabled)===1});
  if(method==='PATCH'&&sub==='/api/config'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const body=await parseBody(request)||{};
    const visibility=['public','members'].includes(lower(body.visibility))?lower(body.visibility):instance.visibility;
    const anonymous=body.allowAnonymousWrite===undefined?Number(instance.allow_anonymous_write):(body.allowAnonymousWrite?1:0);
    const comments=body.commentsEnabled===undefined?Number(instance.comments_enabled):(body.commentsEnabled?1:0);
    await env.DB.prepare('UPDATE ekodi_board_instances SET visibility=?,allow_anonymous_write=?,comments_enabled=?,updated_at=? WHERE board_id=?')
      .bind(visibility,anonymous,comments,now(),instance.board_id).run();
    await audit(env,instance,who,'config.update','board',instance.board_id,{visibility,anonymous,comments});
    return boardJson(instance,{ok:true});
  }
  if(method==='GET'&&sub==='/api/export'){
    if(!who.manage)return boardJson(instance,{error:'forbidden'},403);
    const posts=await env.DB.prepare('SELECT * FROM ekodi_board_posts WHERE board_id=? ORDER BY id').bind(instance.board_id).all();
    const comments=await env.DB.prepare('SELECT * FROM ekodi_board_comments WHERE board_id=? ORDER BY id').bind(instance.board_id).all();
    const memberships=await env.DB.prepare('SELECT person_id,role,status,created_at,updated_at FROM ekodi_board_memberships WHERE board_id=? ORDER BY person_id').bind(instance.board_id).all();
    return boardJson(instance,{schemaVersion:2,board:{boardId:instance.board_id,siteId:instance.site_id,tenantSlug:instance.tenant_slug,status:instance.status,config:instance.config_json},posts:posts.results||[],comments:comments.results||[],memberships:memberships.results||[]});
  }
  return boardJson(instance,{error:'not_found'},404);
}

export const EKODI_SITE_BOARD=Object.freeze({
  version:'1.1.0',
  canonicalSuffix:'/board',
  aiIndependent:true,
  siteScoped:true,
  exportable:true,
  sharedPlatformDependency:'authentication_identity_only',
  boardLocalAuthorization:true,
  lifecycleDestructiveReauth:true,
  coreOperations:Object.freeze(['list','read','create','edit','delete','comments','config','export','membership-bootstrap','lifecycle-cancel','lifecycle-delete']),
});
