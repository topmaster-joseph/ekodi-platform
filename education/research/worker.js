import { injectEkodiShell } from '../../ekodi-shell-injector.js';
import { assessResearch, cleanResearchInput } from './planner.js';

const HEADERS = Object.freeze({
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'x-frame-options':'DENY',
  'content-security-policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://ekodi.kr; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://ekodi.kr https://cdn.jsdelivr.net https://renzehysxirjilvdxacv.supabase.co",
});
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...HEADERS}});
const fail=(status,code)=>json({ok:false,error:code},status);
const ownPath=(pathname)=> pathname==='/research'||pathname.startsWith('/research/')?pathname.slice('/research'.length)||'/':pathname;
const limited=(x,n)=>String(x??'').trim().slice(0,n);
const states=new Set(['idea','literature','design','analysis','writing','submission']);
const types=new Set(['thesis','journal','report']);
const services=new Set(['diagnosis','methodology','coaching','manuscript_review']);
function config(env){
 const dataEnabled=Boolean(env.RESEARCH_DB?.prepare&&env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);
 return {dataEnabled,dataMode:dataEnabled?'authenticated-workspace':'local-planning-only',authUrl:'https://ekodi.kr/auth/?site=edu',supabaseUrl:dataEnabled?env.SUPABASE_URL:'',supabasePublishableKey:dataEnabled?env.SUPABASE_PUBLISHABLE_KEY:''};
}
async function readJson(request,max=5000){
 if((request.headers.get('content-type')||'').split(';')[0].toLowerCase()!=='application/json')throw Object.assign(new Error('json_required'),{status:415});
 const length=Number(request.headers.get('content-length')||0);
 if(length>max)throw Object.assign(new Error('payload_too_large'),{status:413});
 const raw=await request.text(); if(raw.length>max)throw Object.assign(new Error('payload_too_large'),{status:413});
 try{return JSON.parse(raw)}catch{throw Object.assign(new Error('invalid_json'),{status:400})}
}
async function identity(request,env){
 const match=/^Bearer ([A-Za-z0-9._~+/-]+)$/.exec(request.headers.get('authorization')||'');
 if(!match)return null;
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;
 const target=new URL('/auth/v1/user',env.SUPABASE_URL);
 if(target.protocol!=='https:')return null;
 try{
  const response=await fetch(target,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+match[1]},signal:AbortSignal.timeout(5500)});
  if(!response.ok)return null;
  const user=await response.json();
  return /^[a-f0-9-]{36}$/i.test(user?.id||'')?user.id:null;
 }catch{return null}
}
async function privateApi(request,env,path){
 if(!env.RESEARCH_DB?.prepare)return fail(503,'research_storage_not_configured');
 if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return fail(503,'research_identity_not_configured');
 const method=request.method;
 if(!['GET','POST','PATCH','DELETE'].includes(method))return fail(405,'method_not_allowed');
 if(method!=='GET'){
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return fail(403,'origin_not_allowed');
 }
 const owner=await identity(request,env);
 if(!owner)return fail(401,'login_required');
 const db=env.RESEARCH_DB;
 if(path==='/api/projects'&&method==='GET'){
  const result=await db.prepare('SELECT id,title,field,kind,stage,next_step,created_at,updated_at FROM research_projects WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100').bind(owner).all();
  return json({ok:true,projects:result.results||[]});
 }
 if(path==='/api/projects'&&method==='POST'){
  const body=await readJson(request);
  const title=limited(body?.title,120);
  const field=limited(body?.field,80);
  const stage=states.has(body?.stage)?body.stage:'idea';
  const kind=types.has(body?.kind)?body.kind:'thesis';
  if(title.length<3)return fail(400,'title_too_short');
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO research_projects (id,owner_id,title,field,kind,stage,next_step) VALUES (?,?,?,?,?,?,?)")
   .bind(id,owner,title,field,kind,stage,limited(body?.next_step,300)).run();
  return json({ok:true,id},201);
 }
 const p=path.match(/^\/api\/projects\/([0-9a-f-]{36})$/);
 if(p&&method==='PATCH'){
  const body=await readJson(request);
  const previous=await db.prepare('SELECT id FROM research_projects WHERE id=? AND owner_id=?').bind(p[1],owner).first();
  if(!previous)return fail(404,'project_not_found');
  const title=limited(body?.title,120);if(title.length<3)return fail(400,'title_too_short');
  const stage=states.has(body?.stage)?body.stage:'idea';
  await db.prepare("UPDATE research_projects SET title=?,stage=?,next_step=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
   .bind(title,stage,limited(body?.next_step,300),p[1],owner).run();
  return json({ok:true,id:p[1]});
 }
 if(p&&method==='DELETE'){
  const result=await db.prepare('DELETE FROM research_projects WHERE id=? AND owner_id=?').bind(p[1],owner).run();
  return json({ok:Boolean(result.meta?.changes),deleted:Boolean(result.meta?.changes)});
 }
 if(path==='/api/consultations'&&method==='GET'){
  const result=await db.prepare('SELECT id,service,topic,preferred_time,status,created_at FROM research_consultations WHERE owner_id=? ORDER BY created_at DESC LIMIT 50').bind(owner).all();
  return json({ok:true,consultations:result.results||[]});
 }
 if(path==='/api/consultations'&&method==='POST'){
  const body=await readJson(request);
  if(body?.consent!==true)return fail(400,'privacy_consent_required');
  const service=services.has(body?.service)?body.service:'diagnosis';
  const topic=limited(body?.topic,240);
  const preferred=limited(body?.preferred_time,90);
  if(topic.length<6)return fail(400,'topic_too_short');
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO research_consultations (id,owner_id,service,topic,preferred_time) VALUES (?,?,?,?,?)").bind(id,owner,service,topic,preferred).run();
  return json({ok:true,id,status:'received'},201);
 }
 return fail(404,'not_found');
}
export default {
 async fetch(request,env={}){
  const url=new URL(request.url);
  if(url.pathname==='/research')return Response.redirect(url.origin+'/research/'+url.search,308);
  const path=ownPath(url.pathname);
  if(path==='/health')return json({ok:true,service:'ekodi-research',phase:'foundation',dataMode:config(env).dataMode,privateDocuments:false,payments:false,aiExecution:false,authoritativeData:config(env).dataEnabled});
  if(path==='/config.js')return new Response('window.EKODI_RESEARCH_CONFIG='+JSON.stringify(config(env))+';',{
   headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...HEADERS}
  });
  if(path==='/api/diagnosis'){
   if(request.method!=='POST')return fail(405,'method_not_allowed');
   try{return json({ok:true,diagnosis:assessResearch(cleanResearchInput(await readJson(request,3000)))});}
   catch(error){return fail(error.status||400,error.message||'invalid_request');}
  }
  if(path.startsWith('/api/')){
   try{return await privateApi(request,env,path)}catch(error){if(error.status)return fail(error.status,error.message);return fail(503,'temporary_service_error')}
  }
  if(!['GET','HEAD'].includes(request.method))return fail(405,'method_not_allowed');
  if(path==='/admin'||path==='/admin/')return Response.redirect('https://ekodi.kr/research/#operations',307);
  if(!env.ASSETS?.fetch)return fail(503,'research_assets_unavailable');
  const assetUrl=new URL(request.url);assetUrl.pathname='/research'+(path==='/'?'/index.html':path);
  let response=await env.ASSETS.fetch(new Request(assetUrl,request));
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(HEADERS))headers.set(key,value);
  headers.set('cache-control',path==='/'?'no-cache':'public, max-age=300');
  response=new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  if(response.status===200&&headers.get('content-type')?.includes('text/html'))return injectEkodiShell(response,'edu');
  return response;
 }
};
