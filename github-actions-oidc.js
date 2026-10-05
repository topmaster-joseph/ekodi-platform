const ISSUER='https://token.actions.githubusercontent.com';
const CONFIG_URL=`${ISSUER}/.well-known/openid-configuration`;
export const EKODI_COMPLETION_OIDC_AUDIENCE='ekodi-orchestrator-completion';
const REPOSITORY='topmaster-joseph/ekodi-platform';
const WORKFLOW_REF_PREFIX=`${REPOSITORY}/.github/workflows/reconcile-orchestrator-completions.yml@`;

function text(value,max=500){return String(value??'').trim().slice(0,max)}
function decodeBase64Url(value){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  const raw=atob(padded);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function jsonSegment(value){
  try{return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)))}catch{return null}
}
function audienceIncludes(value,expected){
  return (Array.isArray(value)?value:[value]).map(String).includes(expected);
}
async function jsonFetch(url,fetchImpl){
  const response=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'ekodi-github-actions-oidc-verifier'}});
  if(!response?.ok)throw new Error(`OIDC_FETCH_HTTP_${Number(response?.status||0)}`);
  return response.json();
}

export async function verifyGitHubActionsOidc(token,{fetchImpl=fetch,nowMs=Date.now()}={}){
  const compact=text(token,12000);
  const parts=compact.split('.');
  if(parts.length!==3)return Object.freeze({ok:false,reason:'malformed_token'});
  const header=jsonSegment(parts[0]),claims=jsonSegment(parts[1]);
  if(!header||!claims||header.alg!=='RS256'||!text(header.kid,200))return Object.freeze({ok:false,reason:'unsupported_token'});

  try{
    const config=await jsonFetch(CONFIG_URL,fetchImpl);
    if(config?.issuer!==ISSUER)return Object.freeze({ok:false,reason:'issuer_configuration_mismatch'});
    const jwksUrl=text(config?.jwks_uri,500);
    if(!jwksUrl.startsWith(`${ISSUER}/`))return Object.freeze({ok:false,reason:'jwks_origin_mismatch'});
    const jwks=await jsonFetch(jwksUrl,fetchImpl);
    const jwk=(Array.isArray(jwks?.keys)?jwks.keys:[]).find(key=>key?.kid===header.kid&&key?.kty==='RSA');
    if(!jwk)return Object.freeze({ok:false,reason:'signing_key_not_found'});
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const signingInput=new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(parts[2]),signingInput);
    if(!verified)return Object.freeze({ok:false,reason:'signature_invalid'});
  }catch(error){
    return Object.freeze({ok:false,reason:'oidc_verification_unavailable',detail:text(error?.message||error,120)});
  }

  const nowSeconds=Math.floor(Number(nowMs)/1000);
  const exp=Number(claims.exp||0),nbf=Number(claims.nbf||0);
  if(!exp||exp<nowSeconds-30)return Object.freeze({ok:false,reason:'token_expired'});
  if(nbf&&nbf>nowSeconds+30)return Object.freeze({ok:false,reason:'token_not_yet_valid'});
  if(claims.iss!==ISSUER)return Object.freeze({ok:false,reason:'issuer_mismatch'});
  if(!audienceIncludes(claims.aud,EKODI_COMPLETION_OIDC_AUDIENCE))return Object.freeze({ok:false,reason:'audience_mismatch'});
  if(claims.repository!==REPOSITORY)return Object.freeze({ok:false,reason:'repository_mismatch'});
  if(claims.ref!=='refs/heads/main')return Object.freeze({ok:false,reason:'main_ref_required'});
  if(!['workflow_run','workflow_dispatch','schedule'].includes(text(claims.event_name,40)))return Object.freeze({ok:false,reason:'event_not_allowed'});
  if(!text(claims.workflow_ref,500).startsWith(WORKFLOW_REF_PREFIX))return Object.freeze({ok:false,reason:'workflow_not_allowed'});

  return Object.freeze({
    ok:true,
    repository:REPOSITORY,
    ref:'refs/heads/main',
    eventName:text(claims.event_name,40),
    workflowRef:text(claims.workflow_ref,500),
    workflowSha:text(claims.workflow_sha,80),
    runId:text(claims.run_id,80),
    runAttempt:text(claims.run_attempt,40),
    actor:text(claims.actor,120),
    subject:text(claims.sub,500),
  });
}
