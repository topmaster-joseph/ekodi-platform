/**
 * Read-only, member-only finance disclosure API.
 * Fail closed until the protected ministry_finance_read_context RPC is deployed.
 * The RPC must enforce current tenant membership and return approved snapshot
 * blocks only; neither client claims nor this API authorize accounting edits.
 */
import {canonicalMinistryTenant,selectMinistryFinanceDisclosure} from '../../../ministry-finance-disclosure-policy.js';

const ALLOWED_ORIGINS=new Set(['https://ekodi.kr']);
function cors(origin){
  const headers={'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'GET,OPTIONS','vary':'Origin','access-control-max-age':'600'};
  if(origin&&ALLOWED_ORIGINS.has(origin))headers['access-control-allow-origin']=origin;
  return headers;
}
function reply(body,status,origin){
  return new Response(JSON.stringify(body),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'private, no-store, max-age=0',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer',...cors(origin)
  }});
}
function env(name){return (Deno.env.get(name)||'').trim();}
function tokenFrom(request){
  const header=request.headers.get('authorization')||'';
  const match=/^Bearer ([A-Za-z0-9_.~-]+)$/i.exec(header);
  return match&&match[1].length<=8192?match[1]:null;
}
function yearOrNull(raw){
  if(!/^\d{4}$/.test(String(raw||'')))return null;
  const year=Number(raw);return year>=2020&&year<=2100?year:null;
}
function selectSections(raw){
  const chosen=raw===null?['income','expense','balance']:raw.split(',').map(s=>s.trim());
  return chosen.length<=4&&chosen.every(s=>['income','expense','balance','budget'].includes(s))
    ?[...new Set(chosen)]:null;
}
async function verifiedAuthUser(base,pub,token){
  const response=await fetch(base+'/auth/v1/user',{headers:{apikey:pub,authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)return null;
  const value=await response.json().catch(()=>null);
  return value?.id&&value?.email_confirmed_at&&!value?.is_anonymous?{id:String(value.id)}:null;
}
async function approvedReadContext(base,secret,payload){
  const response=await fetch(base+'/rest/v1/rpc/ministry_finance_read_context',{
    method:'POST',
    headers:{apikey:secret,authorization:'Bearer '+secret,'content-type':'application/json'},
    body:JSON.stringify(payload),
    cache:'no-store'
  });
  if(!response.ok)return null; // Includes missing migration; never fall back to raw ledger.
  return await response.json().catch(()=>null);
}
Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(request.method!=='GET')return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405,origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply({ok:false,error:'ORIGIN_NOT_ALLOWED'},403,origin);
  const url=new URL(request.url);
  const site=url.searchParams.get('site')||'';
  if(!canonicalMinistryTenant(site))return reply({ok:false,error:'TENANT_NOT_ALLOWED'},404,origin);
  const year=yearOrNull(url.searchParams.get('year'));
  const sections=selectSections(url.searchParams.get('sections'));
  if(!year||sections===null)return reply({ok:false,error:'INVALID_SELECTION'},400,origin);
  const token=tokenFrom(request);
  if(!token)return reply({ok:false,error:'AUTH_REQUIRED'},401,origin);
  const base=env('SUPABASE_URL').replace(/\/+$/,'');
  const publishable=env('SUPABASE_ANON_KEY')||env('SUPABASE_PUBLISHABLE_KEY');
  const secret=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!base||!publishable||!secret)return reply({ok:false,error:'SERVICE_NOT_READY'},503,origin);
  try{
    const user=await verifiedAuthUser(base,publishable,token);
    if(!user)return reply({ok:false,error:'AUTH_REQUIRED'},401,origin);
    const context=await approvedReadContext(base,secret,{p_site:site,p_subject_id:user.id,p_year:year});
    if(!context||!context.membership)return reply({ok:false,error:'NOT_AVAILABLE'},403,origin);
    const projection=selectMinistryFinanceDisclosure({
      site,verifiedUser:user,membership:context.membership,
      publication:context.publication,requestedSections:sections
    });
    if(!projection.ok){
      return reply({ok:false,error:projection.reason},projection.reason==='not_published'?200:403,origin);
    }
    return reply(projection,200,origin);
  }catch{
    // Do not include database or user record contents in an error.
    return reply({ok:false,error:'SERVICE_NOT_READY'},503,origin);
  }
});
