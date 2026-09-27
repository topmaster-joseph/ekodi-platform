const GITHUB_OIDC_ISSUER='https://token.actions.githubusercontent.com';
const GITHUB_OIDC_CONFIG=GITHUB_OIDC_ISSUER+'/.well-known/openid-configuration';
const EXPECTED_AUDIENCE='ekodi-site-improvement';
const EXPECTED_REPOSITORY='topmaster-joseph/ekodi-platform';
const EXPECTED_REF='refs/heads/main';
const EXPECTED_WORKFLOW_REF='topmaster-joseph/ekodi-platform/.github/workflows/site-improvement-cloud.yml@refs/heads/main';
const EXPECTED_EVENT='workflow_dispatch';
const MAX_TOKEN_AGE_SECONDS=10*60;
const MAX_REQUEST_BYTES=8*1024*1024;

const text=(value,max=400)=>String(value??'').trim().slice(0,max);

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
  if(claims.event_name!==EXPECTED_EVENT)errors.push('event_name');
  const exp=Number(claims.exp||0);
  const iat=Number(claims.iat||0);
  const nbf=Number(claims.nbf||iat||0);
  if(!exp||exp<=nowSeconds-30)errors.push('expired');
  if(!iat||iat>nowSeconds+60||nowSeconds-iat>MAX_TOKEN_AGE_SECONDS)errors.push('issued_at');
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
    'x-ekodi-site-improvement-broker':'github-oidc-v1',
  };
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:brokerHeaders()})}

export async function handleSiteImprovementResponsesBroker(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/site-improvement/responses')return null;
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(env.EKODI_PROVIDER_OPENAI_ENABLED!=='true')return json({error:'openai_provider_disabled'},503);
  const upstreamKey=text(env.OPENAI_API_KEY,4000);
  if(!upstreamKey)return json({error:'openai_provider_unavailable'},503);

  const token=bearer(request);
  if(!token)return json({error:'github_oidc_required'},401);
  try{await verifySiteImprovementGitHubOidc(token);}
  catch(error){return json({error:'github_oidc_rejected',reason:text(error?.message||error,300)},401)}

  const length=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(length)&&length>MAX_REQUEST_BYTES)return json({error:'request_too_large'},413);
  const body=await request.arrayBuffer();
  if(body.byteLength>MAX_REQUEST_BYTES)return json({error:'request_too_large'},413);

  const headers=new Headers();
  headers.set('authorization','Bearer '+upstreamKey);
  headers.set('content-type',request.headers.get('content-type')||'application/json');
  headers.set('accept',request.headers.get('accept')||'application/json');
  const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers,body,redirect:'manual'});
  const responseHeaders=brokerHeaders(upstream.headers.get('content-type')||'application/json; charset=utf-8');
  const requestId=upstream.headers.get('x-request-id');
  if(requestId)responseHeaders['x-openai-request-id']=requestId;
  return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
}

export const SITE_IMPROVEMENT_OIDC_BROKER_POLICY=Object.freeze({
  issuer:GITHUB_OIDC_ISSUER,
  audience:EXPECTED_AUDIENCE,
  repository:EXPECTED_REPOSITORY,
  ref:EXPECTED_REF,
  workflowRef:EXPECTED_WORKFLOW_REF,
  eventName:EXPECTED_EVENT,
  maxTokenAgeSeconds:MAX_TOKEN_AGE_SECONDS,
  maxRequestBytes:MAX_REQUEST_BYTES,
  upstream:'https://api.openai.com/v1/responses',
  longLivedCredentialInGitHub:false,
});
