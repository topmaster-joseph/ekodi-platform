import {injectEkodiShell} from './ekodi-shell-injector.js';
import {MANAGEMENT_ACCESS_POLICY,MANAGEMENT_MODULES,MANAGEMENT_WORKSPACE_KINDS,MANAGEMENT_WORKSPACE_TYPES} from './management-platform.js';

function securityHeaders(){return{
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders()}})}
function cleanToken(value,max=8192){const token=String(value||'').trim();return token&&token.length<=max?token:''}
function cfg(env={}){return{
  mode:env.MANAGEMENT_MODE||'isolated-staging',
  integrationsEnabled:env.INTEGRATIONS_ENABLED==='true',
  executionEnabled:false,
  authUrl:'https://ekodi.kr/auth/?site=management',
  minimumTier:'free',
  commercialModel:'base-tier + selected-modules + usage'
}}
function supabaseReady(env){return env.INTEGRATIONS_ENABLED==='true'&&Boolean(env.SUPABASE_URL)&&Boolean(env.SUPABASE_PUBLISHABLE_KEY)}
async function readJson(request){try{return await request.json()}catch{return null}}
async function supabase(env,path,{body=null}={}){
  if(!supabaseReady(env))return{error:json({error:'identity_integration_disabled'},503)};
  const response=await fetch(`${env.SUPABASE_URL}${path}`,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:body==null?undefined:JSON.stringify(body)});
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:'invalid_upstream_response'}}
  if(!response.ok)return{error:json({error:data?.message||data?.error||`upstream_${response.status}`},response.status)};
  return{data};
}
async function exchangeAuth(request,env){
  const body=await readJson(request);const tokenHash=cleanToken(body?.tokenHash);const type=String(body?.type||'email').trim();
  if(!tokenHash)return json({error:'token_required'},400);
  if(!['email','magiclink','signup','invite','recovery','email_change'].includes(type))return json({error:'invalid_token_type'},400);
  const result=await supabase(env,'/auth/v1/verify',{body:{token_hash:tokenHash,type}});if(result.error)return result.error;
  const data=result.data||{};if(!data.access_token||!data.refresh_token)return json({error:'session_not_created'},502);
  return json({accessToken:data.access_token,refreshToken:data.refresh_token,expiresIn:Number(data.expires_in||3600),expiresAt:Number(data.expires_at||0),user:{id:data.user?.id||'',email:data.user?.email||''},tier:'free'});
}
async function managementSpaces(request,env){
  const bearer=String(request.headers.get('authorization')||'');
  if(!bearer.startsWith('Bearer '))return json({error:'unauthorized'},401);
  const token=cleanToken(bearer.slice(7));
  if(!token||!/^[-A-Za-z0-9._~+/=]+$/.test(token))return json({error:'unauthorized'},401);
  if(!supabaseReady(env))return json({error:'identity_integration_disabled'},503);
  let response;
  try{
    response=await fetch(`${env.SUPABASE_URL}/functions/v1/workspace-api/spaces`,{
      method:'GET',
      headers:{authorization:`Bearer ${token}`,apikey:env.SUPABASE_PUBLISHABLE_KEY,accept:'application/json'},
      redirect:'error'
    });
  }catch{return json({error:'workspace_service_unavailable'},503)}
  if(response.status===401||response.status===403)return json({error:'workspace_access_denied'},response.status);
  if(!response.ok)return json({error:'workspace_service_unavailable'},503);
  let data;
  try{data=await response.json()}catch{return json({error:'invalid_workspace_response'},502)}
  if(!Array.isArray(data?.spaces)||!data?.user?.id)return json({error:'invalid_workspace_response'},502);
  const spaces=data.spaces.slice(0,200).map(space=>({
    id:String(space?.workspace_id||space?.id||'').slice(0,100),
    slug:String(space?.slug||'').slice(0,100),
    name:String(space?.name||'').slice(0,160),
    role:String(space?.role||'member').slice(0,80),
    kind:String(space?.kind||'').slice(0,50),
    status:String(space?.status||'').slice(0,40)
  })).filter(space=>space.id&&space.slug&&space.name);
  return json({spaces,scope:'authenticated-member-only',identityKey:'ekodi_id',workspaceKey:'workspace_id'});
}
function validCount(value){return Number.isSafeInteger(value)&&value>=0}
async function managementStoreSummary(request,env,url){
  const authorization=String(request.headers.get('authorization')||'');
  if(!authorization.startsWith('Bearer '))return json({error:'unauthorized'},401);
  const token=cleanToken(authorization.slice(7));
  if(!token||!/^[-A-Za-z0-9._~+/=]+$/.test(token))return json({error:'unauthorized'},401);
  const slug=url.searchParams.get('slug')||'';
  if(!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug))return json({error:'invalid_store_slug'},400);
  if(!supabaseReady(env))return json({error:'identity_integration_disabled'},503);
  let response;
  try{
    response=await fetch(`${env.SUPABASE_URL}/functions/v1/workspace-api/spaces/store-dashboard?slug=${encodeURIComponent(slug)}`,{
      method:'GET',headers:{authorization:`Bearer ${token}`,apikey:env.SUPABASE_PUBLISHABLE_KEY,accept:'application/json'},redirect:'error'
    });
  }catch{return json({error:'store_service_unavailable'},503)}
  if([401,403,404].includes(response.status))return json({error:'store_not_authorized_or_found'},response.status);
  if(!response.ok)return json({error:'store_service_unavailable'},503);
  let body;
  try{body=await response.json()}catch{return json({error:'invalid_store_response'},502)}
  const space=body?.workspace;
  if(!space||typeof space!=='object'||space.slug!==slug||space.kind!=='store'||typeof space.workspace_id!=='string'||!space.workspace_id)return json({error:'invalid_store_response'},502);
  if(!['canonical_menu_count','platform_listing_count','connected_channel_count'].every(key=>validCount(space.summary?.[key]))
    ||typeof space.store?.order_enabled!=='boolean')return json({error:'invalid_store_metrics'},502);
  return json({
    workspace:{id:space.workspace_id,slug,name:String(space.name||'').slice(0,160),role:String(space.role||'member').slice(0,80),kind:'store'},
    summary:{
      canonicalMenuCount:space.summary.canonical_menu_count,
      platformListingCount:space.summary.platform_listing_count,
      connectedChannelCount:space.summary.connected_channel_count,
      orderEnabled:space.store.order_enabled
    },
    dataPolicy:'verified-read-only',
    generatedBy:'official-workspace-api'
  });
}
function publicCatalog(){return MANAGEMENT_MODULES.map(module=>({id:module.id,name:module.name,phase:module.phase,state:module.state,role:module.role,url:module.url||null,reuseExisting:Boolean(module.reuseExisting)}))}
function publicWorkspaceTypes(){return MANAGEMENT_WORKSPACE_TYPES.map(type=>({id:type.id,canonicalKind:type.canonicalKind,label:type.label,hierarchy:Boolean(type.hierarchy),profile:type.profile||null}))}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/config.js')return new Response(`window.EKODI_MANAGEMENT_CONFIG=${JSON.stringify(cfg(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders()}});
  if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://ekodi.kr/admin/?route=organization&source=management',307);
  if(url.pathname==='/api/spaces'){if(request.method!=='GET')return json({error:'method_not_allowed'},405);return managementSpaces(request,env)}
  if(url.pathname==='/api/store-summary'){if(request.method!=='GET')return json({error:'method_not_allowed'},405);return managementStoreSummary(request,env,url)}
  if(request.method==='GET'&&url.pathname==='/api/catalog')return json({platform:'management',guestMode:MANAGEMENT_ACCESS_POLICY.guestMode,minimumTier:MANAGEMENT_ACCESS_POLICY.minimumTier,workspaceKinds:MANAGEMENT_WORKSPACE_KINDS,workspaceTypes:publicWorkspaceTypes(),modules:publicCatalog()});
  if(request.method==='POST'&&url.pathname==='/api/auth/exchange')return exchangeAuth(request,env);
  const asset=await env.ASSETS.fetch(request);
  return injectEkodiShell(asset,'management');
}};
