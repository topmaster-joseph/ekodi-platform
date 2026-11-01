// EKODI Orchestrator: protected, one-shot, READ-ONLY GitHub App installation probe.
// Not an HTTP route, scheduler, mutation client, or independent release authority.
// Enabled only after owner-provisioned app credentials and staging acceptance.
import {parseGitHubQuotaObservation,recordTrustedGitHubQuota} from './github-api-budget-control.js';

const REPOSITORY='topmaster-joseph/ekodi-platform';
const API='https://api.github.com';
const API_VERSION='2022-11-28';
const positiveId=value=>/^[1-9]\d{0,15}$/.test(String(value??''))&&
  Number.isSafeInteger(Number(value))?String(value):null;
const encode=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const DER=pem=>{
  const match=String(pem||'').trim().match(
    /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/\s=]+)\s+-----END PRIVATE KEY-----$/);
  if(!match)throw Error('PKCS8 key required');
  const body=match[1].replace(/\s+/g,'');
  if(body.length>20000||body.length<128||body.length%4!==0)
    throw Error('Invalid PKCS8 key');
  return Uint8Array.from(atob(body),char=>char.charCodeAt(0));
};
const failed=reason=>({ok:false,reason,githubApiCalls:0,tokenExposed:false});

export async function probeEkodiGitHubInstallation(env,{
  fetchImpl=fetch,subtle=globalThis.crypto?.subtle,now=Date.now,
}={}){
  if(env?.EKODI_GITHUB_READONLY_PROBE_ENABLED!=='true')
    return failed('not_enabled');
  const appId=positiveId(env?.EKODI_GITHUB_APP_ID);
  const installationId=positiveId(env?.EKODI_GITHUB_INSTALLATION_ID);
  if(!appId||!installationId||!env?.EKODI_GITHUB_APP_PRIVATE_KEY||
     !env?.DB?.prepare||!subtle)
    return failed('not_provisioned');
  if(env.EKODI_GITHUB_REPOSITORY&&env.EKODI_GITHUB_REPOSITORY!==REPOSITORY)
    return failed('repository_mismatch');

  const observedAtMs=now();
  if(!Number.isSafeInteger(observedAtMs)||observedAtMs<1000000000000||
     observedAtMs>8640000000000000-600000)
    return failed('clock_unavailable');
  let calls=0;
  try{
    // GitHub App JWT lasts under ten minutes; clock skew tolerance is 60 s.
    // GitHub may issue installation tokens in different formats; never parse
    // their prefix/length as an identity proof.
    const key=await subtle.importKey('pkcs8',DER(env.EKODI_GITHUB_APP_PRIVATE_KEY),
      {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
    const timestamp=Math.floor(observedAtMs/1000);
    const signingInput=encode({alg:'RS256',typ:'JWT'})+'.'+encode({
      iat:timestamp-60,exp:timestamp+480,iss:appId,
    });
    const signature=await subtle.sign('RSASSA-PKCS1-v1_5',key,
      new TextEncoder().encode(signingInput));
    const jwt=signingInput+'.'+btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');

    // A single repository, metadata:read ONLY. A token with write permission,
    // unexpected repository, or missing scope can never be used by this probe.
    const tokenResponse=await fetchImpl(
      API+'/app/installations/'+installationId+'/access_tokens',{
        method:'POST',redirect:'manual',signal:AbortSignal.timeout(12000),
        headers:{authorization:'Bearer '+jwt,'accept':'application/vnd.github+json',
          'x-github-api-version':API_VERSION,'content-type':'application/json'},
        body:JSON.stringify({repositories:['ekodi-platform'],permissions:{metadata:'read'}})
      });
    calls++;
    if(tokenResponse.status!==201)return {...failed('token_exchange_denied'),githubApiCalls:calls};
    const issued=await tokenResponse.json();
    const token=issued?.token;
    const expiry=Date.parse(issued?.expires_at||'');
    if(typeof token!=='string'||token.length<16||token.length>4096||
       !Number.isFinite(expiry)||expiry<=observedAtMs+60000||
       issued?.repository_selection!=='selected'||
       !Array.isArray(issued?.repositories)||
       issued.repositories.length!==1||
       issued.repositories[0]?.full_name!==REPOSITORY||
       issued.permissions?.metadata!=='read'||
       Object.entries(issued.permissions||{}).some(([name,permission])=>
         name!=='metadata'||permission!=='read'))
      return {...failed('token_scope_unverified'),githubApiCalls:calls};

    // A single exact-host metadata GET seeds real measured core headers.
    // No status publication, merge, workflow dispatch or repo write is possible.
    const apiResponse=await fetchImpl(API+'/repos/'+REPOSITORY,{
      method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
      headers:{authorization:'Bearer '+token,'accept':'application/vnd.github+json',
        'x-github-api-version':API_VERSION}
    });
    calls++;
    if(apiResponse.status!==200)return {...failed('repository_probe_denied'),githubApiCalls:calls};
    const repoResult=await apiResponse.json();
    if(repoResult?.full_name!==REPOSITORY)
      return {...failed('repository_identity_mismatch'),githubApiCalls:calls};
    // Only authenticated GitHub response headers, never caller supplied
    // quota numbers or a webhook payload, can enter the D1 observation ledger.
    const point=parseGitHubQuotaObservation(apiResponse.headers,{
      status:apiResponse.status,observedAtMs:now(),
    });
    if(!point||point.resource!=='core')
      return {...failed('rate_headers_unverified'),githubApiCalls:calls};
    const stored=await recordTrustedGitHubQuota(env,{
      installationId:Number(installationId),
      headers:apiResponse.headers,status:apiResponse.status,
      observedAtMs:point.observedAtMs,authenticatedServerCall:true
    });
    if(!stored.accepted)
      return {...failed('quota_observation_not_newer'),githubApiCalls:calls};
    return {ok:true,reason:'verified_readonly_observation',githubApiCalls:calls,
      resource:'core',tokenExposed:false,installationVerified:true,
      admissionEnabled:false,releaseAuthorized:false};
  }catch{
    // Deliberately never echo tokens, JWT, keys, fetch URLs, headers or bodies.
    return {...failed('probe_unavailable'),githubApiCalls:calls};
  }
}
