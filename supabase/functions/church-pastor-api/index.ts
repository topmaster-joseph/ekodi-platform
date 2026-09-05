const CENTRAL_SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const CENTRAL_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CHURCH_SLUG='ekodi-church';
const ALLOWED_ORIGINS=new Set(['https://ekodi.kr','https://www.ekodi.kr']);

const READ_ROLES={
  church_staff:['senior_pastor','pastor','care_staff','staff','viewer'],
  church_members:['senior_pastor','pastor','care_staff','staff','viewer'],
  church_services:['senior_pastor','pastor','care_staff','staff','viewer'],
  church_care_tasks:['senior_pastor','pastor','care_staff'],
  church_events:['senior_pastor','pastor','care_staff','staff','viewer'],
};
const WRITE_ROLES={
  church_members:['senior_pastor','pastor','staff'],
  church_services:['senior_pastor','pastor','staff'],
  church_care_tasks:['senior_pastor','pastor','care_staff'],
  church_events:['senior_pastor','pastor','care_staff','staff'],
};
const SAFE_SELECT={
  church_staff:'id,user_id,email,display_name,role,active,created_at',
  church_members:'id,full_name,preferred_name,phone,email,status,household_name,joined_on,created_at',
  church_services:'id,service_date,title,scripture,sermon_title,preacher,status,created_at',
  church_care_tasks:'id,member_id,subject_name,care_type,next_action,due_on,status,created_at',
  church_events:'id,title,event_date,event_time,location,category,status,created_at',
};
const WRITE_FIELDS={
  church_members:['full_name','preferred_name','phone','email','household_name','status','joined_on'],
  church_services:['service_date','title','scripture','sermon_title','preacher','status'],
  church_care_tasks:['member_id','subject_name','care_type','next_action','due_on','status'],
  church_events:['title','event_date','event_time','location','category','status'],
};

function cors(origin){
  const h={'access-control-allow-headers':'authorization,content-type,apikey,prefer','access-control-allow-methods':'GET,POST,OPTIONS','access-control-expose-headers':'content-range','access-control-max-age':'86400','vary':'Origin'};
  if(origin&&ALLOWED_ORIGINS.has(origin))h['access-control-allow-origin']=origin;
  return h;
}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(origin)}});}
function bearer(req){const v=String(req.headers.get('authorization')||'');return v.toLowerCase().startsWith('bearer ')?v.slice(7).trim():'';}
async function centralIdentity(req){
  const token=bearer(req);if(!token||token.length>8192)return null;
  const r=await fetch(`${CENTRAL_SUPABASE_URL}/auth/v1/user`,{headers:{apikey:CENTRAL_PUBLISHABLE_KEY,authorization:`Bearer ${token}`},cache:'no-store'});
  if(!r.ok)return null;const u=await r.json().catch(()=>null);if(!u?.id||!u?.email||!u?.email_confirmed_at)return null;
  return{id:String(u.id),email:String(u.email).toLowerCase()};
}
function localConfig(){const url=Deno.env.get('SUPABASE_URL')||'';const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!url||!key)throw new Error('CHURCH_DB_CONFIG_MISSING');return{url,key};}
async function localRest(path,options={}){
  const {url,key}=localConfig();const headers={apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',Prefer:options.prefer||'return=representation'};
  const r=await fetch(`${url}/rest/v1/${path}`,{method:options.method||'GET',headers,body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
  return r;
}
async function staffFor(userId){
  const q=`church_staff?church_slug=eq.${CHURCH_SLUG}&user_id=eq.${encodeURIComponent(userId)}&active=eq.true&select=${SAFE_SELECT.church_staff}&limit=1`;
  const r=await localRest(q);if(!r.ok)return null;const rows=await r.json().catch(()=>[]);return rows?.[0]||null;
}
function allowed(role,list){return Array.isArray(list)&&list.includes(role);}
function safeQuery(table,url,staff,identity){
  const out=new URLSearchParams();out.set('church_slug',`eq.${CHURCH_SLUG}`);out.set('select',SAFE_SELECT[table]);
  for(const key of ['status','order','limit','id']){for(const value of url.searchParams.getAll(key))out.append(key,value);}
  if(table==='church_staff'){
    if(staff.role==='senior_pastor'){
      const requested=url.searchParams.get('user_id');if(requested)out.set('user_id',requested);
    }else out.set('user_id',`eq.${identity.id}`);
  }
  return out.toString();
}
function cleanPayload(table,input,identity){
  const body={church_slug:CHURCH_SLUG,created_by:identity.id};
  for(const key of WRITE_FIELDS[table]||[]){if(Object.prototype.hasOwnProperty.call(input||{},key)){const value=input[key];body[key]=typeof value==='string'?value.trim():value;}}
  if(table==='church_members'&&!body.full_name)throw new Error('NAME_REQUIRED');
  if(table==='church_services'&&(!body.service_date||!body.title))throw new Error('SERVICE_REQUIRED');
  if(table==='church_care_tasks'&&!body.subject_name)throw new Error('CARE_SUBJECT_REQUIRED');
  if(table==='church_events'&&(!body.event_date||!body.title))throw new Error('EVENT_REQUIRED');
  return body;
}
async function audit(identity,table,row){
  await localRest('church_audit_logs',{method:'POST',body:{church_slug:CHURCH_SLUG,actor_user_id:identity.id,action:'create',entity_type:table,entity_id:String(row?.id||'')}}).catch(()=>null);
}
function proxyResponse(upstream,origin){
  const headers={'content-type':upstream.headers.get('content-type')||'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(origin)};
  const range=upstream.headers.get('content-range');if(range)headers['content-range']=range;
  return new Response(upstream.body,{status:upstream.status,headers});
}

Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:'ORIGIN_NOT_ALLOWED'},403,origin);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(!['GET','POST'].includes(req.method))return json({error:'METHOD_NOT_ALLOWED'},405,origin);
  const identity=await centralIdentity(req);if(!identity)return json({error:'AUTH_REQUIRED'},401,origin);
  let staff=null;try{staff=await staffFor(identity.id);}catch(error){return json({error:String(error?.message||error)},503,origin);}
  if(!staff)return json({error:'CHURCH_STAFF_REQUIRED'},403,origin);
  const url=new URL(req.url);const table=String(url.searchParams.get('table')||'');
  if(!Object.prototype.hasOwnProperty.call(READ_ROLES,table))return json({error:'TABLE_NOT_ALLOWED'},404,origin);
  if(req.method==='GET'){
    if(!allowed(staff.role,READ_ROLES[table]))return json({error:'ROLE_NOT_ALLOWED'},403,origin);
    const query=safeQuery(table,url,staff,identity);
    const upstream=await localRest(`${table}?${query}`,{prefer:req.headers.get('prefer')||'return=representation'});
    return proxyResponse(upstream,origin);
  }
  if(!allowed(staff.role,WRITE_ROLES[table]))return json({error:'ROLE_NOT_ALLOWED'},403,origin);
  let input={};try{input=await req.json();}catch{return json({error:'INVALID_JSON'},400,origin);}
  let body;try{body=cleanPayload(table,input,identity);}catch(error){return json({error:String(error?.message||error)},400,origin);}
  const upstream=await localRest(table,{method:'POST',body,prefer:'return=representation'});
  if(!upstream.ok)return proxyResponse(upstream,origin);
  const rows=await upstream.json().catch(()=>[]);await audit(identity,table,rows?.[0]);
  return json(rows,201,origin);
});
