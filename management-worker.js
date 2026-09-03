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
  authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=management&return_to=https%3A%2F%2Fmanagement.ekodi.kr%2F',
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
function publicCatalog(){return MANAGEMENT_MODULES.map(module=>({id:module.id,name:module.name,phase:module.phase,state:module.state,role:module.role,url:module.url||null,reuseExisting:Boolean(module.reuseExisting)}))}
function publicWorkspaceTypes(){return MANAGEMENT_WORKSPACE_TYPES.map(type=>({id:type.id,canonicalKind:type.canonicalKind,label:type.label,hierarchy:Boolean(type.hierarchy),profile:type.profile||null}))}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/config.js')return new Response(`window.EKODI_MANAGEMENT_CONFIG=${JSON.stringify(cfg(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders()}});
  if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?route=organization&source=management.ekodi.kr',307);
  if(request.method==='GET'&&url.pathname==='/api/catalog')return json({platform:'management',guestMode:MANAGEMENT_ACCESS_POLICY.guestMode,minimumTier:MANAGEMENT_ACCESS_POLICY.minimumTier,workspaceKinds:MANAGEMENT_WORKSPACE_KINDS,workspaceTypes:publicWorkspaceTypes(),modules:publicCatalog()});
  if(request.method==='POST'&&url.pathname==='/api/auth/exchange')return exchangeAuth(request,env);
  const asset=await env.ASSETS.fetch(request);
  return injectEkodiShell(asset,'management');
}};
