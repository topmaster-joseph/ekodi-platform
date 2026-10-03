const SITEVERIFY_URL='https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_ALLOWED_HOSTNAMES=Object.freeze([
  'ekodi.kr',
  'www.ekodi.kr',
  'seonammedi.kr',
  'www.seonammedi.kr',
  'xn--3e0b8b58jw4co4mnpll3k.kr',
  'www.xn--3e0b8b58jw4co4mnpll3k.kr',
]);

function clean(value,max=4096){return String(value??'').trim().slice(0,max)}
function enabled(env){return clean(env?.TURNSTILE_PUBLIC_WRITE_ESCALATION,40).toLowerCase()==='enabled'}
function allowedHostnames(env){
  const configured=clean(env?.TURNSTILE_ALLOWED_HOSTNAMES,2000);
  return new Set((configured?configured.split(','):DEFAULT_ALLOWED_HOSTNAMES).map(value=>clean(value,253).toLowerCase()).filter(Boolean));
}
function tokenFrom(request){
  return clean(request.headers.get('x-ekodi-turnstile-token')||request.headers.get('cf-turnstile-response'),4096);
}

export function turnstileEscalationConfigured(env={}){
  return enabled(env)&&Boolean(clean(env?.TURNSTILE_SECRET_KEY,4096));
}

export function turnstileEscalationHeaders(env={}){
  if(!turnstileEscalationConfigured(env))return {};
  const headers={'x-ekodi-turnstile-required':'1'};
  const siteKey=clean(env?.TURNSTILE_SITE_KEY,512);
  if(siteKey)headers['x-ekodi-turnstile-sitekey']=siteKey;
  return headers;
}

export async function verifyTurnstileEscalation(request,env={}){
  const configured=turnstileEscalationConfigured(env);
  const token=tokenFrom(request);
  if(!configured)return {configured:false,tokenPresent:Boolean(token),success:false,reason:'disabled_or_unconfigured'};
  if(!token)return {configured:true,tokenPresent:false,success:false,reason:'token_missing'};

  const body=new URLSearchParams({secret:clean(env.TURNSTILE_SECRET_KEY,4096),response:token});
  const remoteIp=clean(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0],128);
  if(remoteIp)body.set('remoteip',remoteIp);

  const fetchImpl=typeof env?.TURNSTILE_VERIFY_FETCH==='function'?env.TURNSTILE_VERIFY_FETCH:fetch;
  let response;
  try{
    response=await fetchImpl(SITEVERIFY_URL,{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body,
      signal:AbortSignal.timeout(5000),
    });
  }catch(error){
    console.warn('EKODI Turnstile verification unavailable',{error:String(error?.message||error)});
    return {configured:true,tokenPresent:true,success:false,reason:'verification_unavailable'};
  }

  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.success)return {configured:true,tokenPresent:true,success:false,reason:'challenge_failed'};
  const hostname=clean(result.hostname,253).toLowerCase();
  if(hostname&&!allowedHostnames(env).has(hostname))return {configured:true,tokenPresent:true,success:false,reason:'hostname_mismatch'};
  return {configured:true,tokenPresent:true,success:true,hostname,reason:'verified'};
}

export const TURNSTILE_ESCALATION_CONSTANTS=Object.freeze({
  SITEVERIFY_URL,
  DEFAULT_ALLOWED_HOSTNAMES,
});
