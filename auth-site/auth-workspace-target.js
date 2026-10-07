import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const ACCESS=`${SUPABASE_URL}/functions/v1/access-api`;
const PERSON_WORKSPACE=`${SUPABASE_URL}/functions/v1/workspace-api`;
const PERSON_SCOPED_SITES=new Set(['social','energy']);
const params=new URLSearchParams(location.search);
const site=String(params.get('site')||'').trim().toLowerCase();
const requested=String(params.get('workspace')||'').trim();
const serviceDefaults={cgma:'https://ekodi.kr/cgma/',biz:'https://ekodi.kr/ekodibiz',trade:'https://ekodi.kr/ekodibiz/trade',mall:'https://ekodi.kr/ekodimall',books:'https://ekodi.kr/books',church:'https://ekodi.kr/ekodichurch',lab:'https://ekodi.kr/ekodilab',mission:'https://ekodi.kr/ekodimission/',community:'https://ekodi.kr/community',social:'https://ekodi.kr/social',energy:'https://ekodi.kr/energy'};
const serviceOrigins={
  cgma:['https://ekodi.kr','https://cgma.or.kr','https://cgma.ekodi.kr'],
  marketing:['https://marketing.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurt.ekodi.kr','https://yogurtpurple.ekodi.kr'],
  biz:['https://ekodi.kr','https://biz.ekodi.kr'],
  trade:['https://ekodi.kr','https://trade.biz.ekodi.kr','https://trade.ekodi.kr'],
  mall:['https://ekodi.kr'],
  pay:['https://pay.ekodi.kr'],
  books:['https://ekodi.kr','https://books.ekodi.kr'],
  church:['https://ekodi.kr','https://church.ekodi.kr'],
  lab:['https://ekodi.kr','https://lab.ekodi.kr'],
  mission:['https://ekodi.kr'],
  community:['https://ekodi.kr'],
  edu:['https://edu.ekodi.kr'],
  media:['https://media.ekodi.kr'],
  social:['https://ekodi.kr','https://social.ekodi.kr'],
  energy:['https://ekodi.kr','https://energy.ekodi.kr'],
};
const origins=serviceOrigins[site]||[];
const fallback=serviceDefaults[site]||`${origins[0]}/`;
if(!origins.length||!requested||requested.length>180||!/^[a-z]+:[a-zA-Z0-9:_-]+$/.test(requested))throw new Error('target_workspace_not_applicable');

const CANONICAL_SITE_PREFIX=Object.freeze({cgma:'/cgma',biz:'/ekodibiz',trade:'/ekodibiz/trade',mall:'/ekodimall',books:'/books',church:'/ekodichurch',lab:'/ekodilab',mission:'/ekodimission',community:'/community',social:'/social',energy:'/energy'});
function safeReturn(raw){
  try{const target=new URL(raw||fallback),prefix=CANONICAL_SITE_PREFIX[site]||'';const platformPath=target.origin==='https://ekodi.kr'&&Boolean(prefix)&&(target.pathname===prefix||target.pathname.startsWith(prefix+'/'));return target.protocol==='https:'&&((origins.includes(target.origin)&&target.origin!=='https://ekodi.kr')||platformPath)?target.href:fallback;}
  catch{return fallback;}
}
const returnTo=safeReturn(params.get('return_to'));
const sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
const WORKSPACE_API=PERSON_SCOPED_SITES.has(site)?PERSON_WORKSPACE:ACCESS;
let routing=false;

async function routeToRequestedWorkspace(){
  if(routing||window.__EKODI_WORKSPACE_ROUTING)return false;
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)return false;
  routing=true;
  try{
    const headers={apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`};
    const listResponse=await fetch(`${WORKSPACE_API}/workspaces?site=${encodeURIComponent(site)}`,{headers,cache:'no-store'});
    if(!listResponse.ok)throw new Error('workspace_list_failed');
    const listData=await listResponse.json();
    const workspaces=Array.isArray(listData?.workspaces)?listData.workspaces:[];
    const target=workspaces.find(item=>item?.workspace_key===requested&&item?.requires_handoff===true&&['active','pre_registered'].includes(String(item?.status||'')));
    if(!target){routing=false;return false;}
    const handoffResponse=await fetch(`${WORKSPACE_API}/handoff`,{
      method:'POST',headers:{...headers,'content-type':'application/json'},cache:'no-store',
      body:JSON.stringify({site,return_to:returnTo,workspace_key:requested}),
    });
    if(!handoffResponse.ok)throw new Error('workspace_handoff_failed');
    const handoff=await handoffResponse.json();
    if(!handoff?.tokenHash||!handoff?.returnTo)throw new Error('workspace_handoff_unavailable');
    const destination=new URL(handoff.returnTo);
    const context={workspace:handoff.workspace?.workspace_key||'',tenant:handoff.workspace?.tenant_id||'',store:handoff.workspace?.store_id||'',createdAt:Date.now()};
    window.__EKODI_WORKSPACE_ROUTING=true;
    if(destination.origin===location.origin){
      try{sessionStorage.setItem('ekodi-auth-return-context',JSON.stringify(context))}catch{}
      location.assign(destination.href);return true;
    }
    const form=document.createElement('form');form.method='POST';form.action=destination.href;form.hidden=true;
    const fields={ekodi_auth_return:'1',ekodi_token:handoff.tokenHash,ekodi_type:handoff.type||'email',ekodi_workspace:context.workspace,ekodi_tenant:context.tenant,ekodi_store:context.store};
    for(const [name,value] of Object.entries(fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value||'');form.append(input)}
    document.body.append(form);form.submit();
    return true;
  }catch(error){
    routing=false;
    console.error('EKODI targeted workspace handoff',error);
    return false;
  }
}

await routeToRequestedWorkspace();
sb.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')queueMicrotask(()=>routeToRequestedWorkspace())});
