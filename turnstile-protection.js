const VERIFY_URL='https://challenges.cloudflare.com/turnstile/v0/siteverify';
const CONFIG_PATH='/api/security/turnstile/config';
const ACTION='public_write';
const MUTATION_METHODS=new Set(['POST','PUT','PATCH','DELETE']);
const PROTECTED_PATHS=new Set(['/api/seonammedi/voices']);
const PROTECTED_PATTERNS=[/^\/api\/seonammedi\/voices\/\d+\/replies$/];
const ALLOWED_HOSTS=new Set([
  'ekodi.kr',
  'seonammedi.kr',
  'www.seonammedi.kr',
  'xn--3e0b8b58jw4co4mnpll3k.kr',
  'www.xn--3e0b8b58jw4co4mnpll3k.kr',
]);

function normalizeHost(value=''){return String(value||'').trim().toLowerCase().replace(/^www\./,'');}
function protectedPath(pathname=''){const path=String(pathname||'').toLowerCase();return PROTECTED_PATHS.has(path)||PROTECTED_PATTERNS.some(pattern=>pattern.test(path));}
function configured(env={}){return String(env.TURNSTILE_ENFORCEMENT||'').toLowerCase()==='enabled'&&Boolean(String(env.TURNSTILE_SITE_KEY||'').trim())&&Boolean(String(env.TURNSTILE_SECRET_KEY||'').trim());}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function denied(message,code='TURNSTILE_REQUIRED',status=403){return json({error:message,code},status);}

export function turnstilePublicConfig(env={}){
  const enabled=configured(env);
  return Object.freeze({
    enabled,
    sitekey:enabled?String(env.TURNSTILE_SITE_KEY||'').trim():'',
    mode:'managed',
    appearance:'interaction-only',
    execution:'execute',
    action:ACTION,
  });
}

export function handleTurnstileSecurityApi(request,env={}){
  const url=new URL(request.url);
  if(url.pathname!==CONFIG_PATH)return null;
  if(!['GET','HEAD'].includes(String(request.method||'GET').toUpperCase()))return json({error:'method_not_allowed'},405);
  if(!ALLOWED_HOSTS.has(url.hostname.toLowerCase()))return json({error:'host_not_allowed'},404);
  const body=JSON.stringify(turnstilePublicConfig(env));
  return new Response(request.method==='HEAD'?null:body,{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export async function verifyTurnstileResponse({token,secret,remoteip='',expectedHostname='',fetchImpl=globalThis.fetch}){
  if(!token||token.length>2048)return {ok:false,reason:'missing_or_invalid_token'};
  if(!secret)return {ok:false,reason:'missing_secret'};
  let response;
  try{
    response=await fetchImpl(VERIFY_URL,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({secret,response:token,remoteip:remoteip||undefined,idempotency_key:crypto.randomUUID()}),
    });
  }catch(error){
    console.error('EKODI Turnstile Siteverify unavailable',error);
    return {ok:false,reason:'siteverify_unavailable'};
  }
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.success!==true)return {ok:false,reason:'challenge_failed',errorCodes:Array.isArray(result?.['error-codes'])?result['error-codes']:[]};
  if(String(result?.action||'')!==ACTION)return {ok:false,reason:'action_mismatch'};
  const verifiedHost=normalizeHost(result?.hostname||'');
  const expectedHost=normalizeHost(expectedHostname);
  if(!verifiedHost||!expectedHost||verifiedHost!==expectedHost)return {ok:false,reason:'hostname_mismatch'};
  return {ok:true,hostname:verifiedHost};
}

export async function enforceTurnstilePublicWrite(request,env={}){
  const method=String(request.method||'GET').toUpperCase();
  const url=new URL(request.url);
  if(!MUTATION_METHODS.has(method)||!protectedPath(url.pathname))return null;
  if(!configured(env))return null;

  const token=String(request.headers.get('x-ekodi-turnstile-token')||'').trim();
  if(!token)return denied('자동화 방지 확인이 필요합니다.','TURNSTILE_REQUIRED',403);

  const verified=await verifyTurnstileResponse({
    token,
    secret:String(env.TURNSTILE_SECRET_KEY||'').trim(),
    remoteip:String(request.headers.get('cf-connecting-ip')||'').trim(),
    expectedHostname:url.hostname,
  });
  if(!verified.ok){
    console.warn('EKODI Turnstile verification rejected',{path:url.pathname,reason:verified.reason,ray:request.headers.get('cf-ray')||''});
    if(verified.reason==='siteverify_unavailable')return denied('보안 확인 서비스가 일시적으로 사용할 수 없습니다.','TURNSTILE_UNAVAILABLE',503);
    return denied('자동화 방지 확인에 실패했습니다. 다시 시도해 주세요.','TURNSTILE_REJECTED',403);
  }
  return null;
}

export const TURNSTILE_CONSTANTS=Object.freeze({
  VERIFY_URL,
  CONFIG_PATH,
  ACTION,
  PROTECTED_PATHS:Object.freeze([...PROTECTED_PATHS]),
  ALLOWED_HOSTS:Object.freeze([...ALLOWED_HOSTS]),
});
