const CENTRAL_SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const CENTRAL_PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CHURCH_SLUG='ekodi-church';
const ALLOWED_ORIGINS=new Set(['https://ekodi.kr']);

function cors(origin){
  const h={'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'GET,POST,OPTIONS','access-control-max-age':'86400','vary':'Origin'};
  if(origin&&ALLOWED_ORIGINS.has(origin))h['access-control-allow-origin']=origin;
  return h;
}
function json(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(origin)}});}
function bearer(req){const v=String(req.headers.get('authorization')||'');return v.toLowerCase().startsWith('bearer ')?v.slice(7).trim():'';}
async function identity(req){
  const token=bearer(req);if(!token||token.length>8192)return null;
  const r=await fetch(`${CENTRAL_SUPABASE_URL}/auth/v1/user`,{headers:{apikey:CENTRAL_PUBLISHABLE_KEY,authorization:`Bearer ${token}`},cache:'no-store'});
  if(!r.ok)return null;
  const u=await r.json().catch(()=>null);
  if(!u?.id||!u?.email||!u?.email_confirmed_at)return null;
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
function intYear(value){
  const year=Number.parseInt(String(value||''),10);
  const current=new Date().getUTCFullYear();
  return Number.isInteger(year)&&year>=2000&&year<=current?year:current;
}
async function proxyJson(upstream,origin){
  const body=await upstream.json().catch(()=>({error:'UPSTREAM_INVALID_RESPONSE'}));
  return json(body,upstream.status,origin);
}

Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:'ORIGIN_NOT_ALLOWED'},403,origin);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(!['GET','POST'].includes(req.method))return json({error:'METHOD_NOT_ALLOWED'},405,origin);

  const who=await identity(req);
  if(!who)return json({error:'AUTH_REQUIRED'},401,origin);

  if(req.method==='GET'){
    const url=new URL(req.url);
    const year=intYear(url.searchParams.get('year'));
    let upstream;
    try{upstream=await rpc('church_member_giving_summary',{p_church_slug:CHURCH_SLUG,p_user_id:who.id,p_email:who.email,p_tax_year:year});}
    catch(error){return json({error:String(error?.message||error)},503,origin);}
    return proxyJson(upstream,origin);
  }

  let input={};try{input=await req.json();}catch{return json({error:'INVALID_JSON'},400,origin);}
  const action=String(input.action||'').trim();
  if(action!=='request_receipt')return json({error:'ACTION_NOT_ALLOWED'},400,origin);
  const year=intYear(input.taxYear);
  let upstream;
  try{upstream=await rpc('church_member_receipt_request_create',{p_church_slug:CHURCH_SLUG,p_user_id:who.id,p_email:who.email,p_tax_year:year});}
  catch(error){return json({error:String(error?.message||error)},503,origin);}
  return proxyJson(upstream,origin);
});
