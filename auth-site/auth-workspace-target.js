import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS=`${SUPABASE_URL}/functions/v1/access-api`;
const params=new URLSearchParams(location.search);
const site=String(params.get('site')||'').trim().toLowerCase();
const requested=String(params.get('workspace')||'').trim();
const serviceOrigins={
  cgma:['https://cgma.ekodi.kr'],
  marketing:['https://marketing.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurt.ekodi.kr','https://yogurtpurple.ekodi.kr'],
  biz:['https://biz.ekodi.kr'],
  trade:['https://trade.ekodi.kr'],
  mall:['https://mall.ekodi.kr'],
  pay:['https://pay.ekodi.kr'],
  books:['https://books.ekodi.kr'],
  church:['https://church.ekodi.kr'],
  lab:['https://lab.ekodi.kr'],
  mission:['https://mission.ekodi.kr'],
  community:['https://community.ekodi.kr'],
  edu:['https://edu.ekodi.kr'],
  media:['https://media.ekodi.kr'],
};
const origins=serviceOrigins[site]||[];
if(!origins.length||!requested||requested.length>180||!/^[a-z]+:[a-zA-Z0-9:_-]+$/.test(requested))throw new Error('target_workspace_not_applicable');

function safeReturn(raw){
  try{const target=new URL(raw||origins[0]);return target.protocol==='https:'&&origins.includes(target.origin)?target.href:`${origins[0]}/`;}
  catch{return `${origins[0]}/`;}
}
const returnTo=safeReturn(params.get('return_to'));
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
let routing=false;

async function routeToRequestedWorkspace(){
  if(routing)return false;
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)return false;
  routing=true;
  try{
    const headers={apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`};
    const listResponse=await fetch(`${ACCESS}/workspaces?site=${encodeURIComponent(site)}`,{headers,cache:'no-store'});
    if(!listResponse.ok)throw new Error('workspace_list_failed');
    const listData=await listResponse.json();
    const workspaces=Array.isArray(listData?.workspaces)?listData.workspaces:[];
    const target=workspaces.find(item=>item?.workspace_key===requested&&item?.requires_handoff===true&&['active','pre_registered'].includes(String(item?.status||'')));
    if(!target){routing=false;return false;}
    const handoffResponse=await fetch(`${ACCESS}/handoff`,{
      method:'POST',headers:{...headers,'content-type':'application/json'},cache:'no-store',
      body:JSON.stringify({site,return_to:returnTo,workspace_key:requested}),
    });
    if(!handoffResponse.ok)throw new Error('workspace_handoff_failed');
    const handoff=await handoffResponse.json();
    if(!handoff?.tokenHash||!handoff?.returnTo)throw new Error('workspace_handoff_unavailable');
    const destination=new URL(handoff.returnTo);
    const fragment=new URLSearchParams({ekodi_token:handoff.tokenHash,ekodi_type:handoff.type||'email'});
    if(handoff.workspace?.workspace_key)fragment.set('ekodi_workspace',handoff.workspace.workspace_key);
    if(handoff.workspace?.tenant_id)fragment.set('ekodi_tenant',handoff.workspace.tenant_id);
    if(handoff.workspace?.store_id)fragment.set('ekodi_store',handoff.workspace.store_id);
    destination.hash=fragment.toString();
    location.assign(destination.href);
    return true;
  }catch(error){
    routing=false;
    console.error('EKODI targeted workspace handoff',error);
    return false;
  }
}

await routeToRequestedWorkspace();
sb.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')queueMicrotask(()=>routeToRequestedWorkspace())});