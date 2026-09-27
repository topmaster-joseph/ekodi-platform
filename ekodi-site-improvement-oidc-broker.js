const GITHUB_OIDC_ISSUER='https://token.actions.githubusercontent.com';
const GITHUB_OIDC_CONFIG=GITHUB_OIDC_ISSUER+'/.well-known/openid-configuration';
const EXPECTED_AUDIENCE='ekodi-site-improvement';
const EXPECTED_REPOSITORY='topmaster-joseph/ekodi-platform';
const EXPECTED_REF='refs/heads/main';
const EXPECTED_WORKFLOW_REF='topmaster-joseph/ekodi-platform/.github/workflows/site-improvement-cloud.yml@refs/heads/main';
const EXPECTED_ENVIRONMENT='development';
const MAX_OIDC_TOKEN_AGE_SECONDS=10*60;
const BROKER_TOKEN_TTL_SECONDS=30*60;
const BROKER_TOKEN_MAX_REQUESTS=256;
const MAX_REQUEST_BYTES=8*1024*1024;
const BROKER_TOKEN_PATTERN=/^ekodi_[A-Za-z0-9_-]{40,96}$/;
const TASK_ID_PATTERN=/^task-[0-9]{14}-[a-z0-9]{4}$/i;

const text=(value,max=400)=>String(value??'').trim().slice(0,max);
const dbReady=env=>Boolean(env?.DB&&typeof env.DB.prepare==='function');
const changes=result=>Number(result?.meta?.changes??result?.changes??0);
const nowIso=()=>new Date().toISOString();

function decodeBase64Url(value){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}

function decodeJsonSegment(value){
  const bytes=decodeBase64Url(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function audIncludes(aud,expected){
  return Array.isArray(aud)?aud.includes(expected):aud===expected;
}

export function validateSiteImprovementOidcClaims(claims={},nowSeconds=Math.floor(Date.now()/1000)){
  const errors=[];
  if(claims.iss!==GITHUB_OIDC_ISSUER)errors.push('issuer');
  if(!audIncludes(claims.aud,EXPECTED_AUDIENCE))errors.push('audience');
  if(claims.repository!==EXPECTED_REPOSITORY)errors.push('repository');
  if(claims.ref!==EXPECTED_REF)errors.push('ref');
  if(claims.workflow_ref!==EXPECTED_WORKFLOW_REF)errors.push('workflow_ref');
  if(claims.environment!==EXPECTED_ENVIRONMENT)errors.push('environment');
  const exp=Number(claims.exp||0);
  const iat=Number(claims.iat||0);
  const nbf=Number(claims.nbf||iat||0);
  if(!exp||exp<=nowSeconds-30)errors.push('expired');
  if(!iat||iat>nowSeconds+60||nowSeconds-iat>MAX_OIDC_TOKEN_AGE_SECONDS)errors.push('issued_at');
  if(nbf&&nbf>nowSeconds+60)errors.push('not_before');
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),claims});
}

async function githubJwks(fetchFn=fetch){
  const configResponse=await fetchFn(GITHUB_OIDC_CONFIG,{headers:{accept:'application/json'},cf:{cacheTtl:3600,cacheEverything:true}});
  if(!configResponse.ok)throw new Error('github_oidc_config_unavailable');
  const config=await configResponse.json();
  const jwksUrl=new URL(String(config?.jwks_uri||''));
  if(jwksUrl.origin!==GITHUB_OIDC_ISSUER||jwksUrl.pathname!=='/.well-known/jwks')throw new Error('github_oidc_jwks_uri_invalid');
  const response=await fetchFn(jwksUrl.toString(),{headers:{accept:'application/json'},cf:{cacheTtl:3600,cacheEverything:true}});
  if(!response.ok)throw new Error('github_oidc_jwks_unavailable');
  const data=await response.json();
  return Array.isArray(data?.keys)?data.keys:[];
}

export async function verifySiteImprovementGitHubOidc(token,{fetchFn=fetch,nowSeconds=Math.floor(Date.now()/1000),jwks=null}={}){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw new Error('github_oidc_token_invalid');
  const header=decodeJsonSegment(parts[0]);
  const claims=decodeJsonSegment(parts[1]);
  if(header?.alg!=='RS256'||!text(header?.kid,200))throw new Error('github_oidc_header_invalid');
  const checked=validateSiteImprovementOidcClaims(claims,nowSeconds);
  if(!checked.ok)throw new Error('github_oidc_claims_invalid:'+checked.errors.join(','));
  const keys=Array.isArray(jwks)?jwks:await githubJwks(fetchFn);
  const jwk=keys.find(item=>item?.kid===header.kid&&item?.kty==='RSA');
  if(!jwk)throw new Error('github_oidc_signing_key_missing');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signed=new TextEncoder().encode(parts[0]+'.'+parts[1]);
  const signature=decodeBase64Url(parts[2]);
  const valid=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,signature,signed);
  if(!valid)throw new Error('github_oidc_signature_invalid');
  return Object.freeze({ok:true,claims});
}

function randomUrlSafe(bytes=32){
  const data=new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let binary='';
  for(const byte of data)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function sha256(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function isSiteImprovementBrokerToken(value){
  return BROKER_TOKEN_PATTERN.test(String(value||''));
}

function bearer(request){
  const value=text(request.headers.get('authorization'),16000);
  return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():'';
}

function brokerHeaders(contentType='application/json; charset=utf-8'){
  return {
    'content-type':contentType,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
    'x-ekodi-site-improvement-broker':'opaque-token-v2',
  };
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:brokerHeaders()})}

async function requestJson(request,maxBytes=4096){
  const raw=await request.text();
  if(raw.length>maxBytes)throw new Error('request_too_large');
  try{return raw?JSON.parse(raw):{}}catch{throw new Error('invalid_json')}
}

async function cleanupBrokerTokens(env,now=nowIso()){
  if(!dbReady(env))return;
  await env.DB.prepare("DELETE FROM ekodi_site_improvement_broker_tokens WHERE expires_at<=? OR revoked_at<>''")
    .bind(now).run().catch(()=>null);
}

async function issueBrokerToken(env,taskId,claims){
  if(!dbReady(env))throw new Error('state_store_unavailable');
  if(!TASK_ID_PATTERN.test(taskId))throw new Error('invalid_task_id');
  const task=await env.DB.prepare("SELECT id,state,created_by FROM ai_control_tasks WHERE id=? LIMIT 1").bind(taskId).first();
  if(!task||task.created_by!=='ekodi-site-improvement-scheduler')throw new Error('scheduler_task_required');
  if(!['queued','allocating','running','approval_required'].includes(String(task.state||'')))throw new Error('scheduler_task_inactive');

  const issuedAt=nowIso();
  const expiresAt=new Date(Date.now()+BROKER_TOKEN_TTL_SECONDS*1000).toISOString();
  const raw='ekodi_'+randomUrlSafe(32);
  if(!isSiteImprovementBrokerToken(raw))throw new Error('broker_token_generation_failed');
  const tokenHash=await sha256(raw);
  await cleanupBrokerTokens(env,issuedAt);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ekodi_site_improvement_broker_tokens WHERE task_id=?").bind(taskId),
    env.DB.prepare(`INSERT INTO ekodi_site_improvement_broker_tokens
      (token_hash,task_id,repository,workflow_ref,issued_at,expires_at,request_count,max_requests,last_used_at,revoked_at)
      VALUES (?,?,?,?,?,?,0,?,'','')`)
      .bind(tokenHash,taskId,text(claims?.repository,180),text(claims?.workflow_ref,300),issuedAt,expiresAt,BROKER_TOKEN_MAX_REQUESTS),
  ]);
  return Object.freeze({token:raw,expiresAt,maxRequests:BROKER_TOKEN_MAX_REQUESTS});
}

async function consumeBrokerToken(env,raw){
  if(!dbReady(env))throw new Error('state_store_unavailable');
  if(!isSiteImprovementBrokerToken(raw))throw new Error('broker_token_invalid');
  const tokenHash=await sha256(raw);
  const now=nowIso();
  const result=await env.DB.prepare(`UPDATE ekodi_site_improvement_broker_tokens
    SET request_count=request_count+1,last_used_at=?
    WHERE token_hash=? AND revoked_at='' AND expires_at>? AND request_count<max_requests`)
    .bind(now,tokenHash,now).run();
  if(changes(result)<1)throw new Error('broker_token_expired_or_exhausted');
  const row=await env.DB.prepare("SELECT task_id,expires_at,request_count,max_requests FROM ekodi_site_improvement_broker_tokens WHERE token_hash=? LIMIT 1")
    .bind(tokenHash).first();
  if(!row)throw new Error('broker_token_missing_after_consume');
  return Object.freeze({taskId:String(row.task_id||''),expiresAt:String(row.expires_at||''),requestCount:Number(row.request_count||0),maxRequests:Number(row.max_requests||0)});
}

async function revokeBrokerToken(env,raw){
  if(!dbReady(env))throw new Error('state_store_unavailable');
  if(!isSiteImprovementBrokerToken(raw))throw new Error('broker_token_invalid');
  const tokenHash=await sha256(raw);
  const now=nowIso();
  const result=await env.DB.prepare("UPDATE ekodi_site_improvement_broker_tokens SET revoked_at=? WHERE token_hash=? AND revoked_at=''")
    .bind(now,tokenHash).run();
  return changes(result)>0;
}

async function handleTokenExchange(request,env){
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!dbReady(env))return json({error:'state_store_unavailable'},503);
  const oidc=bearer(request);
  if(!oidc)return json({error:'github_oidc_required'},401);
  let verified;
  try{verified=await verifySiteImprovementGitHubOidc(oidc);}
  catch(error){return json({error:'github_oidc_rejected',reason:text(error?.message||error,300)},401)}
  let input;
  try{input=await requestJson(request);}catch(error){return json({error:text(error?.message||error,80)},400)}
  const taskId=text(input?.taskId,100);
  try{
    const issued=await issueBrokerToken(env,taskId,verified.claims);
    return json({token:issued.token,tokenType:'Bearer',expiresAt:issued.expiresAt,maxRequests:issued.maxRequests},201);
  }catch(error){
    const reason=text(error?.message||error,160);
    const status=reason==='state_store_unavailable'?503:reason==='scheduler_task_required'||reason==='scheduler_task_inactive'?403:400;
    return json({error:'broker_token_issue_failed',reason},status);
  }
}

async function handleTokenRevoke(request,env){
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const raw=bearer(request);
  if(!raw)return json({error:'broker_token_required'},401);
  try{return json({ok:true,revoked:await revokeBrokerToken(env,raw)})}
  catch(error){return json({error:'broker_token_revoke_failed',reason:text(error?.message||error,160)},401)}
}

async function handleResponses(request,env){
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(env.EKODI_PROVIDER_OPENAI_ENABLED!=='true')return json({error:'openai_provider_disabled'},503);
  const upstreamKey=text(env.OPENAI_API_KEY,4000);
  if(!upstreamKey)return json({error:'openai_provider_unavailable'},503);
  const raw=bearer(request);
  if(!raw)return json({error:'broker_token_required'},401);
  let lease;
  try{lease=await consumeBrokerToken(env,raw)}
  catch(error){return json({error:'broker_token_rejected',reason:text(error?.message||error,200)},401)}

  const length=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(length)&&length>MAX_REQUEST_BYTES)return json({error:'request_too_large'},413);
  const body=await request.arrayBuffer();
  if(body.byteLength>MAX_REQUEST_BYTES)return json({error:'request_too_large'},413);

  const headers=new Headers();
  headers.set('authorization','Bearer '+upstreamKey);
  headers.set('content-type',request.headers.get('content-type')||'application/json');
  headers.set('accept',request.headers.get('accept')||'application/json');
  headers.set('x-ekodi-site-improvement-task',lease.taskId);
  const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers,body,redirect:'manual'});
  const responseHeaders=brokerHeaders(upstream.headers.get('content-type')||'application/json; charset=utf-8');
  const requestId=upstream.headers.get('x-request-id');
  if(requestId)responseHeaders['x-openai-request-id']=requestId;
  return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
}

export async function handleSiteImprovementResponsesBroker(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/site-improvement/token')return handleTokenExchange(request,env);
  if(path==='/api/site-improvement/token/revoke')return handleTokenRevoke(request,env);
  if(path==='/api/site-improvement/responses')return handleResponses(request,env);
  return null;
}

export const SITE_IMPROVEMENT_OIDC_BROKER_POLICY=Object.freeze({
  version:'2.0.0',
  issuer:GITHUB_OIDC_ISSUER,
  audience:EXPECTED_AUDIENCE,
  repository:EXPECTED_REPOSITORY,
  ref:EXPECTED_REF,
  workflowRef:EXPECTED_WORKFLOW_REF,
  environment:EXPECTED_ENVIRONMENT,
  maxOidcTokenAgeSeconds:MAX_OIDC_TOKEN_AGE_SECONDS,
  brokerTokenTtlSeconds:BROKER_TOKEN_TTL_SECONDS,
  brokerTokenMaxRequests:BROKER_TOKEN_MAX_REQUESTS,
  brokerTokenPattern:'^ekodi_[A-Za-z0-9_-]{40,96}$',
  maxRequestBytes:MAX_REQUEST_BYTES,
  upstream:'https://api.openai.com/v1/responses',
  longLivedCredentialInGitHub:false,
  githubOidcUsedForExchangeOnly:true,
  brokerTokenStoredAsHashOnly:true,
});
