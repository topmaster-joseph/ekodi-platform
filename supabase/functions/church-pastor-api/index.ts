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
function centralConfig(){
  const url=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)throw new Error('CHURCH_DB_CONFIG_MISSING');
  if(url!==CENTRAL_SUPABASE_URL)throw new Error('CHURCH_DB_NOT_CANONICAL');
  return{url,key};
}
async function rpc(name,body){
  const {url,key}=centralConfig();
  return fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
}
async function staffFor(userId){
  const r=await rpc('church_pastor_staff_for_user',{p_church_slug:CHURCH_SLUG,p_user_id:userId});
  if(!r.ok)throw new Error(`CHURCH_STAFF_LOOKUP_FAILED:${r.status}`);
  return await r.json().catch(()=>null);
}
function allowed(role,list){return Array.isArray(list)&&list.includes(role);}
function eqValue(value){const v=String(value||'').trim();return v.startsWith('eq.')?v.slice(3):v;}
function uuidOrNull(value){const v=eqValue(value);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)?v:null;}
function listArgs(table,url,staff,identity){
  const rawLimit=Number(url.searchParams.get('limit')||100);
  const p_limit=Number.isFinite(rawLimit)?Math.max(1,Math.min(Math.trunc(rawLimit),250)):100;
  return{
    p_table:table,
    p_church_slug:CHURCH_SLUG,
    p_requester_user_id:identity.id,
    p_is_senior:staff.role==='senior_pastor',
    p_status:eqValue(url.searchParams.get('status'))||null,
    p_id:uuidOrNull(url.searchParams.get('id')),
    p_order:String(url.searchParams.get('order')||'')||null,
    p_limit,
  };
}
function cleanPayload(table,input){
  const body={};
  for(const key of WRITE_FIELDS[table]||[]){if(Object.prototype.hasOwnProperty.call(input||{},key)){const value=input[key];body[key]=typeof value==='string'?value.trim():value;}}
  if(table==='church_members'&&!body.full_name)throw new Error('NAME_REQUIRED');
  if(table==='church_services'&&(!body.service_date||!body.title))throw new Error('SERVICE_REQUIRED');
  if(table==='church_care_tasks'&&!body.subject_name)throw new Error('CARE_SUBJECT_REQUIRED');
  if(table==='church_events'&&(!body.event_date||!body.title))throw new Error('EVENT_REQUIRED');
  return body;
}
function proxyResponse(upstream,origin){
  const headers={'content-type':upstream.headers.get('content-type')||'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(origin)};
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
    let upstream;try{upstream=await rpc('church_pastor_list',listArgs(table,url,staff,identity));}catch(error){return json({error:String(error?.message||error)},503,origin);}
    if(!upstream.ok)return proxyResponse(upstream,origin);
    let rows=await upstream.json().catch(()=>[]);if(!Array.isArray(rows))rows=[];
    if(table==='church_staff'&&staff.role==='senior_pastor'){
      const requested=uuidOrNull(url.searchParams.get('user_id'));if(requested)rows=rows.filter(row=>String(row?.user_id||'')===requested);
    }
    return json(rows,200,origin);
  }
  if(!allowed(staff.role,WRITE_ROLES[table]))return json({error:'ROLE_NOT_ALLOWED'},403,origin);
  let input={};try{input=await req.json();}catch{return json({error:'INVALID_JSON'},400,origin);}
  let payload;try{payload=cleanPayload(table,input);}catch(error){return json({error:String(error?.message||error)},400,origin);}
  let upstream;try{upstream=await rpc('church_pastor_create',{p_table:table,p_church_slug:CHURCH_SLUG,p_payload:payload,p_actor:identity.id});}catch(error){return json({error:String(error?.message||error)},503,origin);}
  if(!upstream.ok)return proxyResponse(upstream,origin);
  const row=await upstream.json().catch(()=>null);return json(row?[row]:[],201,origin);
});
