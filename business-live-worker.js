import baseWorker from './business-worker.js';

function securityHeaders(){return{
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders()}})}
function cleanToken(value,max=8192){const token=String(value||'').trim();return token&&token.length<=max?token:''}
function bearer(request){const value=String(request.headers.get('authorization')||'');return value.toLowerCase().startsWith('bearer ')?cleanToken(value.slice(7)):''}
function config(env={}){
  const integrationsEnabled=env.INTEGRATIONS_ENABLED==='true';
  const dataEnabled=integrationsEnabled&&Boolean(env.SUPABASE_URL)&&Boolean(env.SUPABASE_PUBLISHABLE_KEY);
  return{
    mode:env.BUSINESS_MODE||'isolated-staging',
    integrationsEnabled,
    executionEnabled:env.EXECUTION_ENABLED==='true',
    readiness:Number(env.READINESS||62),
    authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=business&return_to=https%3A%2F%2Fbusiness.ekodi.kr%2F',
    policy:'observe-discern-suggest-approve-act-verify-report',
    defaultWorkspace:'ekodibiz',
    dataEnabled,
    dataMode:dataEnabled?'supabase-aggregate-readonly':'connection-required'
  };
}
function supabaseReady(env){return env.INTEGRATIONS_ENABLED==='true'&&Boolean(env.SUPABASE_URL)&&Boolean(env.SUPABASE_PUBLISHABLE_KEY)}
async function readJson(request){try{return await request.json()}catch{return null}}
async function supabase(env,path,{method='POST',token='',body=null}={}){
  if(!supabaseReady(env))return{response:null,error:json({error:'live_data_disabled'},503)};
  const headers={apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'};
  if(token)headers.authorization=`Bearer ${token}`;
  const response=await fetch(`${env.SUPABASE_URL}${path}`,{method,headers,body:body==null?undefined:JSON.stringify(body)});
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:'invalid_upstream_response'}}
  if(!response.ok)return{response,error:json({error:data?.message||data?.error||`upstream_${response.status}`,code:data?.code||null},response.status)};
  return{response,data};
}
async function exchangeAuth(request,env){
  const body=await readJson(request);const tokenHash=cleanToken(body?.tokenHash);const type=String(body?.type||'email').trim();
  if(!tokenHash)return json({error:'token_required'},400);
  if(!['email','magiclink','signup','invite','recovery','email_change'].includes(type))return json({error:'invalid_token_type'},400);
  const result=await supabase(env,'/auth/v1/verify',{body:{token_hash:tokenHash,type}});if(result.error)return result.error;
  const data=result.data||{};if(!data.access_token||!data.refresh_token)return json({error:'session_not_created'},502);
  return json({accessToken:data.access_token,refreshToken:data.refresh_token,expiresIn:Number(data.expires_in||3600),expiresAt:Number(data.expires_at||0),user:{id:data.user?.id||'',email:data.user?.email||''}});
}
async function refreshAuth(request,env){
  const body=await readJson(request);const refreshToken=cleanToken(body?.refreshToken);
  if(!refreshToken)return json({error:'refresh_token_required'},400);
  const result=await supabase(env,'/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:refreshToken}});if(result.error)return result.error;
  const data=result.data||{};if(!data.access_token||!data.refresh_token)return json({error:'session_not_refreshed'},502);
  return json({accessToken:data.access_token,refreshToken:data.refresh_token,expiresIn:Number(data.expires_in||3600),expiresAt:Number(data.expires_at||0),user:{id:data.user?.id||'',email:data.user?.email||''}});
}
async function rpc(request,env,name,args){
  const token=bearer(request);if(!token)return json({error:'authentication_required'},401);
  const result=await supabase(env,`/rest/v1/rpc/${name}`,{token,body:args});if(result.error)return result.error;
  return json(result.data);
}
async function snapshot(request,env){const body=await readJson(request);return rpc(request,env,'business_os_snapshot',{p_workspace_key:String(body?.workspace||'')})}
async function propose(request,env){const body=await readJson(request);return rpc(request,env,'business_os_propose_action',{
  p_workspace_key:String(body?.workspace||''),p_action_type:String(body?.actionType||''),p_title:String(body?.title||''),p_summary:body?.summary==null?null:String(body.summary),p_priority:String(body?.priority||'normal')
})}
async function decide(request,env){const body=await readJson(request);return rpc(request,env,'business_os_decide_action',{p_action_id:String(body?.actionId||''),p_decision:String(body?.decision||'')})}

export default{async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/config.js')return new Response(`window.EKODI_BUSINESS_CONFIG=${JSON.stringify(config(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders()}});
  if(request.method==='POST'&&url.pathname==='/api/auth/exchange')return exchangeAuth(request,env);
  if(request.method==='POST'&&url.pathname==='/api/auth/refresh')return refreshAuth(request,env);
  if(request.method==='POST'&&url.pathname==='/api/snapshot')return snapshot(request,env);
  if(request.method==='POST'&&url.pathname==='/api/propose-action')return propose(request,env);
  if(request.method==='POST'&&url.pathname==='/api/decide-action')return decide(request,env);
  return baseWorker.fetch(request,env,ctx);
}};