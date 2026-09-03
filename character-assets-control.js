import { handleAdminSessionFastPath } from './admin-session-fastpath.js';

const BASE='/api/control/character';
const PUBLIC_BASE='/api/public/character';
const ALLOWED_TYPES=new Set(['image/png','image/jpeg','image/webp']);
const ALLOWED_KINDS=new Set(['reference','generated']);
const MAX_BYTES=8*1024*1024;

function json(data,status=200,sourceHeaders=new Headers()){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  for(const name of ['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-max-age']){
    const value=sourceHeaders.get(name);if(value)headers.set(name,value);
  }
  return new Response(JSON.stringify(data),{status,headers});
}
function cleanName(value){return String(value||'asset').trim().replace(/[^a-zA-Z0-9._가-힣-]+/g,'-').slice(0,120)||'asset';}
function kindOf(value){const kind=String(value||'').toLowerCase();return ALLOWED_KINDS.has(kind)?kind:'';}
function rowToPublic(row){return {id:row.id,kind:row.kind,filename:row.filename,contentType:row.content_type,size:Number(row.size||0),createdAt:row.created_at,isActive:Boolean(row.is_active)};}
async function ensureSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS character_assets (
    id TEXT PRIMARY KEY,key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,filename TEXT NOT NULL,
    content_type TEXT NOT NULL,size INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
  )`).run();
}
async function adminSession(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await handleAdminSessionFastPath(new Request(url,{method:'GET',headers:request.headers}),env);
  if(!response?.ok)return {response};
  const session=await response.clone().json();
  if(!session?.authenticated||!['super_admin','operator'].includes(String(session.role||''))){
    return {response:json({error:'캐릭터 자산 관리자 권한이 필요합니다.',code:'CHARACTER_FORBIDDEN'},403,response.headers)};
  }
  return {response,session};
}
async function activeRow(env){return env.DB.prepare('SELECT * FROM character_assets WHERE is_active=1 ORDER BY updated_at DESC LIMIT 1').first();}
async function assetRow(env,id){return env.DB.prepare('SELECT * FROM character_assets WHERE id=?').bind(id).first();}
async function serveRow(env,row,cache='public, max-age=300, stale-while-revalidate=3600'){
  if(!row)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
  const object=await env.R2_BUCKET.get(row.key);
  if(!object)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
  const headers=new Headers({'content-type':row.content_type,'cache-control':cache,'x-content-type-options':'nosniff','cross-origin-resource-policy':'cross-origin'});
  const etag=object.httpEtag||object.etag;if(etag)headers.set('etag',etag);
  return new Response(object.body,{status:200,headers});
}
async function publicRoute(request,env,url){
  if(url.pathname===`${PUBLIC_BASE}/manifest`&&request.method==='GET'){
    const row=await activeRow(env);
    const variants=await env.DB.prepare("SELECT * FROM character_assets WHERE kind='generated' ORDER BY is_active DESC,created_at DESC LIMIT 12").all();
    return json({version:2,active:row?rowToPublic(row):null,assetUrl:row?'https://shell.ekodi.kr/character/current':null,variants:(variants.results||[]).map(item=>({...rowToPublic(item),assetUrl:`https://shell.ekodi.kr/character/asset/${item.id}`}))},200);
  }
  const publicAssetMatch=url.pathname.match(new RegExp(`^${PUBLIC_BASE}/asset/([^/]+)$`));
  if(publicAssetMatch&&(request.method==='GET'||request.method==='HEAD')){
    const row=await assetRow(env,decodeURIComponent(publicAssetMatch[1]));
    if(!row||row.kind!=='generated')return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const response=await serveRow(env,row);return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
  }
  if(url.pathname===`${PUBLIC_BASE}/current`&&(request.method==='GET'||request.method==='HEAD')){
    const row=await activeRow(env);if(!row)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const response=await serveRow(env,row);return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
  }
  return null;
}
export async function handleCharacterAssetsControl(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith(BASE)&&!url.pathname.startsWith(PUBLIC_BASE))return null;
  if(!env.DB||!env.R2_BUCKET)return json({error:'Character storage unavailable',code:'CHARACTER_STORAGE_UNAVAILABLE'},503);
  await ensureSchema(env.DB);
  if(url.pathname.startsWith(PUBLIC_BASE))return publicRoute(request,env,url);
  const auth=await adminSession(request,env);if(!auth.session)return auth.response;
  if(url.pathname===`${BASE}/assets`&&request.method==='GET'){
    const rows=await env.DB.prepare('SELECT * FROM character_assets ORDER BY is_active DESC,created_at DESC LIMIT 200').all();
    return json({version:1,assets:(rows.results||[]).map(rowToPublic)},200,auth.response.headers);
  }
  if(url.pathname===`${BASE}/asset`&&request.method==='GET'){
    const row=await assetRow(env,url.searchParams.get('id'));if(!row)return json({error:'Asset not found'},404,auth.response.headers);
    const response=await serveRow(env,row,'private, no-store');const headers=new Headers(response.headers);headers.set('cache-control','no-store');
    return new Response(response.body,{status:response.status,headers});
  }
  if(url.pathname===`${BASE}/assets`&&request.method==='POST'){
    const kind=kindOf(url.searchParams.get('kind'));if(!kind)return json({error:'reference 또는 generated 유형이 필요합니다.'},400,auth.response.headers);
    const contentType=String(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!ALLOWED_TYPES.has(contentType))return json({error:'PNG, JPEG, WebP 이미지만 추가할 수 있습니다.'},415,auth.response.headers);
    const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>MAX_BYTES)return json({error:'이미지는 8MB 이하만 추가할 수 있습니다.'},413,auth.response.headers);
    const id=crypto.randomUUID(),filename=cleanName(url.searchParams.get('name'));
    const ext=contentType==='image/png'?'png':contentType==='image/webp'?'webp':'jpg';
    const key=`character/${kind}/${new Date().toISOString().slice(0,10).replaceAll('-','')}/${id}-${filename.replace(/\.[^.]+$/,'')}.${ext}`;
    await env.R2_BUCKET.put(key,bytes,{httpMetadata:{contentType},customMetadata:{kind,filename,createdBy:auth.session.email}});
    const now=new Date().toISOString(),active=kind==='generated'&&!(await activeRow(env))?1:0;
    await env.DB.prepare('INSERT INTO character_assets(id,key,kind,filename,content_type,size,is_active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,key,kind,filename,contentType,bytes.byteLength,active,auth.session.email,now,now).run();
    return json({ok:true,asset:rowToPublic(await assetRow(env,id))},201,auth.response.headers);
  }
  const activeMatch=url.pathname.match(new RegExp(`^${BASE}/assets/([^/]+)/active$`));
  if(activeMatch&&request.method==='PUT'){
    const id=decodeURIComponent(activeMatch[1]),row=await assetRow(env,id);
    if(!row)return json({error:'Asset not found'},404,auth.response.headers);
    if(row.kind!=='generated')return json({error:'제작된 캐릭터 이미지만 사이트 대표 자산으로 지정할 수 있습니다.'},409,auth.response.headers);
    const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE character_assets SET is_active=0,updated_at=? WHERE is_active=1').bind(now),
      env.DB.prepare('UPDATE character_assets SET is_active=1,updated_at=? WHERE id=?').bind(now,id),
    ]);
    return json({ok:true,active:rowToPublic(await assetRow(env,id))},200,auth.response.headers);
  }
  const deleteMatch=url.pathname.match(new RegExp(`^${BASE}/assets/([^/]+)$`));
  if(deleteMatch&&request.method==='DELETE'){
    const id=decodeURIComponent(deleteMatch[1]),row=await assetRow(env,id);if(!row)return json({error:'Asset not found'},404,auth.response.headers);
    await env.R2_BUCKET.delete(row.key);await env.DB.prepare('DELETE FROM character_assets WHERE id=?').bind(id).run();
    if(row.is_active){
      const next=await env.DB.prepare("SELECT id FROM character_assets WHERE kind='generated' ORDER BY created_at DESC LIMIT 1").first();
      if(next)await env.DB.prepare('UPDATE character_assets SET is_active=1,updated_at=? WHERE id=?').bind(new Date().toISOString(),next.id).run();
    }
    return json({ok:true,deleted:id},200,auth.response.headers);
  }
  return json({error:'Character endpoint not found'},404,auth.response.headers);
}
