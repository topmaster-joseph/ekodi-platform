// Unified EKODI Education routing, access and live-class state.
// Existing lessons remain in their owning files; this layer stores only pointers and session state.
import {ekodiInstructor, instructorEmails, isSameSiteRequest, ADMIN_SESSION_URL} from '../../education-instructor-gate.js';

const COURSE_RE=/^[a-z0-9][a-z0-9-]{1,90}$/;
const EMAIL_RE=/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const COOKIE='ekodi_edu_teacher_v1';
const COOKIE_CONTEXT='ekodi-education-hub:teacher:v1:';
const AUTH_TTL=60*60;
const REGISTER_KEY='edu/instructors/authorized-emails.v1.json';
const STATE_PREFIX='edu/course-hub/live-state/';
const enc=new TextEncoder();
const to64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function from64(s){const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function equal(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a[i]^b[i];return x===0;}
function readCookie(req){
  for(const part of String(req.headers.get('cookie')||'').split(';')){
    const at=part.indexOf('=');
    if(at>=0&&part.slice(0,at).trim()===COOKIE)return part.slice(at+1).trim();
  }
  return '';
}
function cookiePath(url){return url.hostname==='ekodi.kr'?'/edu/':'/';}
function cookie(url,val,ttl){return COOKIE+'='+val+'; Path='+cookiePath(url)+'; Max-Age='+ttl+'; HttpOnly; Secure; SameSite=Lax';}
function keyOK(env){return typeof env?.EDU_GATE_SIGNING_KEY==='string'&&env.EDU_GATE_SIGNING_KEY.length>=32;}
async function sign(text,key){
  const h=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',h,enc.encode(COOKIE_CONTEXT+text)));
}
async function issue(env,identity){
  if(!keyOK(env))throw Error('teacher signing secret missing');
  const data={v:1,role:identity.role,email:identity.email||'',exp:Math.floor(Date.now()/1000)+AUTH_TTL};
  const payload=to64(enc.encode(JSON.stringify(data)));
  return 'v1.'+payload+'.'+to64(await sign(payload,env.EDU_GATE_SIGNING_KEY));
}
async function registered(env){
  const fixed=instructorEmails(env);
  const dynamic=new Set();
  if(!env?.EDU_DOCS?.get)return {fixed,dynamic,available:false};
  const obj=await env.EDU_DOCS.get(REGISTER_KEY);
  if(obj){
    const raw=await obj.text();
    if(raw.length>40000)throw Error('instructor registry too large');
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed.emails)||parsed.emails.length>150)throw Error('invalid instructor registry');
    for(const value of parsed.emails){
      const s=String(value||'').trim().toLowerCase();
      if(EMAIL_RE.test(s))dynamic.add(s);
    }
  }
  return {fixed,dynamic,available:true};
}
async function teacher(req,env){
  if(!keyOK(env))return null;
  const parts=readCookie(req).split('.');
  if(parts.length!==3||parts[0]!=='v1'||parts[1].length>1200||!/^[\w-]+$/.test(parts[1])||!/^[\w-]{43}$/.test(parts[2]))return null;
  try{
    const expected=await sign(parts[1],env.EDU_GATE_SIGNING_KEY);
    if(!equal(expected,from64(parts[2])))return null;
    const data=JSON.parse(new TextDecoder().decode(from64(parts[1])));
    if(data.v!==1||!Number.isSafeInteger(data.exp)||data.exp<=Math.floor(Date.now()/1000)||data.exp>Math.floor(Date.now()/1000)+AUTH_TTL)return null;
    if(data.role==='super_admin')return {role:'super_admin',email:String(data.email||'')};
    if(data.role!=='instructor'||!EMAIL_RE.test(String(data.email||'')))return null;
    const rights=await registered(env); // Revocations take effect on the next request.
    return rights.fixed.has(data.email)||rights.dynamic.has(data.email)?{role:'instructor',email:data.email}:null;
  }catch{return null;}
}
async function superAdmin(token,env,{fetchImpl=fetch}={}){
  if(typeof token!=='string'||token.length<16||token.length>4096)return null;
  const options={method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'manual'};
  try{
    const res=typeof env?.CONTROL_API?.fetch==='function'
      ?await env.CONTROL_API.fetch(new Request(ADMIN_SESSION_URL,options))
      :await fetchImpl(env?.EDU_ADMIN_SESSION_URL||ADMIN_SESSION_URL,{...options,cache:'no-store'});
    if(!res.ok)return null;
    const data=await res.json().catch(()=>null);
    return data?.authenticated&&String(data.role||'')==='super_admin'?{role:'super_admin',email:String(data.email||'')}:null;
  }catch{return null;}
}
function answer(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff',...extra}});}
function noOrigin(req,url){return !req.headers.get('origin')||!isSameSiteRequest(req,url);}
async function requestJson(req,max=2500){
  if(!String(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return null;
  const text=await req.text();
  if(text.length>max)return null;
  try{return JSON.parse(text)}catch{return null;}
}
async function catalog(env,url){
  if(!env?.ASSETS?.fetch)return null;
  const u=new URL(url);
  u.pathname='/courses/catalog.json';u.search='';
  const res=await env.ASSETS.fetch(new Request(u));
  if(!res.ok)return null;
  const data=await res.json();
  return data&&Array.isArray(data.courses)&&Array.isArray(data.fields)&&Array.isArray(data.audiences)?data:null;
}
// Public course metadata is an explicit allowlist. Private owner Drive/Slides
// identifiers and teacher-only tools never leave the verified teacher endpoint.
function publicCourse(course){
  const out={};
  for(const field of ['id','title','year','publisher','category','audience','slides',
    'presentationFormat','multilingualContentNote','summary','fields',
    'audiences','syllabus','studyUrl','learnerTool','delivery','status',
    'publicSlideAccess']){
    if(Object.hasOwn(course,field))out[field]=course[field];
  }
  // Only known service-relative public resources may appear in the student API.
  if(Array.isArray(course.resources)){
    out.resources=course.resources.filter(resource=>resource&&typeof resource.label==='string'&&
      typeof resource.url==='string'&&/^\/(?!\/)(?:study\/|pizza-experience\/)/.test(resource.url)&&
      !/^\/edu(?:\/edu)+(?=\/|$)/.test(resource.url))
      .map(resource=>({label:resource.label,url:resource.url}));
  }
  return out;
}
function publicCatalog(data){
  return {schemaVersion:data.schemaVersion,fields:data.fields,audiences:data.audiences,
    courses:data.courses.filter(course=>course.status==='available').map(publicCourse)};
}
async function validCourse(env,url,id){
  if(!COURSE_RE.test(String(id||'')))return false;
  const data=await catalog(env,url);
  return !!data?.courses.some(c=>c.id===id);
}
function stateKey(id){return STATE_PREFIX+id+'.json';}
function safeState(input,id){
  const index=Number(input?.step);
  const live=input?.live===true;
  const notice=String(input?.notice||'').trim().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,240);
  if(!Number.isInteger(index)||index<0||index>50)return null;
  return {version:1,courseId:id,step:index,live,notice,updatedAt:new Date().toISOString()};
}
async function loadState(env,id){
  if(!env?.EDU_DOCS?.get)return null;
  const obj=await env.EDU_DOCS.get(stateKey(id));
  if(!obj)return null;
  const s=await obj.text();
  if(s.length>3000)throw Error('oversized live state');
  const data=JSON.parse(s);
  return data?.courseId===id&&Number.isInteger(data.step)?data:null;
}
async function staticPage(req,env,path,status=200){
  const u=new URL(req.url);u.pathname='/course-hub/'+path;u.search='';
  const asset=await env.ASSETS.fetch(new Request(u));
  const headers=new Headers(asset.headers);
  headers.set('cache-control',path==='signin.html'?'no-store, private':status===200?'no-cache':'no-store, private');
  if(status!==200)headers.set('x-robots-tag','noindex,nofollow');
  return new Response(asset.body,{status:status===200?asset.status:status,headers});
}
// Permitted client-facing paths all resolve to a single reader, never to copies of course material.
export function isEducationHubPath(pathname){
  const p=String(pathname||'');
  if(/^\/teach\/(?:access|status|logout|instructors|live-state)\/?$/.test(p))return false;
  return /^\/(?:courses(?:\/[a-z0-9-]+)?|fields\/[a-z0-9-]+|audiences\/[a-z0-9-]+|learn(?:\/[a-z0-9-]+)?|teach(?:\/[a-z0-9-]+)?)\/?$/.test(p);
}
export async function courseHubRouter(req,env,{url=new URL(req.url)}={}){
  const p=url.pathname,method=req.method.toUpperCase();
  if(p==='/courses/catalog.json'&&(method==='GET'||method==='HEAD')){
    try{
      const data=await catalog(env,url);
      if(!data)return answer({ok:false,code:'catalog_unavailable'},503);
      const result=answer(publicCatalog(data));
      return method==='HEAD'?new Response(null,{status:result.status,headers:result.headers}):result;
    }catch{return answer({ok:false,code:'catalog_unavailable'},503);}
  }
  if(p==='/teach/catalog.json'&&(method==='GET'||method==='HEAD')){
    const session=await teacher(req,env);
    if(!session)return answer({ok:false,code:'teacher_access_denied'},403);
    try{
      const data=await catalog(env,url);
      if(!data)return answer({ok:false,code:'catalog_unavailable'},503);
      const result=answer(data);
      return method==='HEAD'?new Response(null,{status:result.status,headers:result.headers}):result;
    }catch{return answer({ok:false,code:'catalog_unavailable'},503);}
  }
  if(p==='/teach/status'&&method==='GET'){
    const session=await teacher(req,env);
    return answer({authenticated:!!session,role:session?.role||null,registryEnabled:!!env?.EDU_DOCS?.get});
  }
  if(p==='/teach/access'&&method==='POST'){
    if(noOrigin(req,url))return answer({ok:false,code:'origin_denied'},403);
    if(!keyOK(env))return answer({ok:false,code:'teacher_signing_unavailable'},503);
    const body=await requestJson(req,9000);
    if(!body)return answer({ok:false,code:'invalid_request'},400);
    const adminToken=String(req.headers.get('authorization')||'').replace(/^Bearer\s+/,'');
    let identity=null;
    if(adminToken)identity=await superAdmin(adminToken,env);
    if(!identity&&body.accessToken){
      let rights;
      try{rights=await registered(env);}catch{return answer({ok:false,code:'registry_unavailable'},503);}
      const all=new Set([...rights.fixed,...rights.dynamic]);
      identity=await ekodiInstructor(String(body.accessToken),{...env,EDU_INSTRUCTOR_EMAILS:[...all].join(',')});
      if(identity)identity={role:'instructor',email:identity.email};
    }
    if(!identity)return answer({ok:false,code:'teacher_access_denied',message:'최고관리자 또는 등록된 강사 계정만 이용할 수 있습니다.'},403);
    const signed=await issue(env,identity);
    return answer({ok:true,role:identity.role,location:url.hostname==='ekodi.kr'?'/edu/teach/':'/teach/'},200,{'set-cookie':cookie(url,signed,AUTH_TTL)});
  }
  if(p==='/teach/logout'&&method==='POST'){
    if(noOrigin(req,url))return answer({ok:false,code:'origin_denied'},403);
    return answer({ok:true},200,{'set-cookie':cookie(url,'',0)});
  }
  if(p==='/teach/instructors'&&(method==='GET'||method==='POST')){
    if(method==='POST'&&noOrigin(req,url))return answer({ok:false,code:'origin_denied'},403);
    const token=String(req.headers.get('authorization')||'').replace(/^Bearer\s+/,'');
    const admin=await superAdmin(token,env);
    if(!admin)return answer({ok:false,code:'super_admin_required'},403);
    if(!env?.EDU_DOCS?.get||!env?.EDU_DOCS?.put)return answer({ok:false,code:'storage_unavailable'},503);
    let rights;
    try{rights=await registered(env);}catch{return answer({ok:false,code:'registry_unavailable'},503);}
    if(method==='GET')return answer({ok:true,emails:[...rights.dynamic].sort(),fixed:[...rights.fixed].sort()});
    const body=await requestJson(req);
    const email=String(body?.email||'').trim().toLowerCase();
    if(!EMAIL_RE.test(email)||email.length>254||!['add','remove'].includes(body?.action))return answer({ok:false,code:'invalid_email_or_action'},400);
    if(rights.fixed.has(email)&&body.action==='remove')return answer({ok:false,code:'configured_instructor_cannot_be_removed_here'},409);
    if(body.action==='add')rights.dynamic.add(email);else rights.dynamic.delete(email);
    if(rights.dynamic.size>100)return answer({ok:false,code:'registry_limit'},409);
    try{await env.EDU_DOCS.put(REGISTER_KEY,JSON.stringify({version:1,emails:[...rights.dynamic].sort(),updatedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});}
    catch{return answer({ok:false,code:'registry_write_failed'},503);}
    return answer({ok:true,emails:[...rights.dynamic].sort()});
  }
  if(p==='/courses/live-state'&&method==='GET'){
    const id=url.searchParams.get('id')||'';
    if(!await validCourse(env,url,id))return answer({ok:false,code:'unknown_course'},404);
    try{return answer({ok:true,state:await loadState(env,id)||{version:1,courseId:id,step:0,live:false,notice:'',updatedAt:null},connected:!!env?.EDU_DOCS?.get});}
    catch{return answer({ok:false,code:'state_unavailable'},503);}
  }
  if(p==='/teach/live-state'&&method==='PUT'){
    if(noOrigin(req,url))return answer({ok:false,code:'origin_denied'},403);
    const session=await teacher(req,env);
    if(!session)return answer({ok:false,code:'teacher_access_denied'},403);
    if(!env?.EDU_DOCS?.put)return answer({ok:false,code:'storage_unavailable'},503);
    const body=await requestJson(req);
    const id=String(body?.courseId||'');
    if(!await validCourse(env,url,id))return answer({ok:false,code:'unknown_course'},404);
    const state=safeState(body,id);
    if(!state)return answer({ok:false,code:'invalid_state'},400);
    try{await env.EDU_DOCS.put(stateKey(id),JSON.stringify(state),{httpMetadata:{contentType:'application/json'}});}
    catch{return answer({ok:false,code:'state_write_failed'},503);}
    return answer({ok:true,state});
  }
  if(!isEducationHubPath(p))return null;
  if(method!=='GET'&&method!=='HEAD')return answer({ok:false,code:'method_not_allowed'},405);
  if(/^\/teach(?:\/|$)/.test(p)){
    const session=await teacher(req,env);
    if(!session)return staticPage(req,env,'signin.html',401);
    const result=await staticPage(req,env,'index.html');
    const headers=new Headers(result.headers);
    headers.set('cache-control','private, no-store');headers.set('x-robots-tag','noindex,nofollow');
    return new Response(result.body,{status:result.status,headers});
  }
  return staticPage(req,env,'index.html');
}
// Exported for deterministic security tests; no raw credentials returned.
export const EDUCATION_HUB_ACCESS={authEndpoint:'/teach/access',adminRegistry:'/teach/instructors',publicCatalog:'/courses/catalog.json',teacherCatalog:'/teach/catalog.json',publicState:'/courses/live-state',teacherState:'/teach/live-state',cookie:COOKIE};
