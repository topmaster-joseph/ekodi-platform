const MUTATION_METHODS = new Set(['POST','PUT','PATCH','DELETE']);
const BLOCKED_METHODS = new Set(['TRACE','CONNECT']);
const STANDARD_BODY_LIMIT = 8 * 1024 * 1024;
const LARGE_MEDIA_BODY_LIMIT = 32 * 1024 * 1024;
const MAX_QUERY_LENGTH = 8192;
const encoder = new TextEncoder();

function classifyPath(pathname=''){
  const path=String(pathname||'').toLowerCase();
  const admin=/(^|\/)admin(?:\/|$)/.test(path);
  const auth=path==='/auth'||path.startsWith('/auth/')||path.includes('/auth/');
  const api=path==='/api'||path.startsWith('/api/')||path.includes('/api/');
  const live=path==='/live'||path.startsWith('/live/')||path.includes('/live/');
  const media=/\/(?:upload|uploads|media|recording|recordings)(?:\/|$)/.test(path);
  const sensitive=admin||auth||api;
  return {admin,auth,api,live,media,sensitive,surface:admin?'admin':auth?'auth':api?'api':live?'live':'public'};
}

async function digest(value){
  const bytes=encoder.encode(String(value||'unknown'));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}

async function identityFor(request){
  const authorization=String(request.headers.get('authorization')||'');
  if(authorization.startsWith('Bearer ')){
    const token=authorization.slice(7).trim();
    if(token.length>=16)return 'session:'+await digest(token);
  }
  const ip=String(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown');
  const ua=String(request.headers.get('user-agent')||'unknown').slice(0,160);
  return 'network:'+await digest(ip+'|'+ua);
}

async function limiterResult(binding,key){
  if(!binding?.limit)return {available:false,allowed:false};
  try{
    const result=await binding.limit({key});
    return {available:true,allowed:result?.success!==false};
  }catch(error){
    console.error('EKODI platform security limiter unavailable',error);
    return {available:false,allowed:false};
  }
}

function securityError(message,code,status,retryAfter=''){
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  if(retryAfter)headers.set('retry-after',retryAfter);
  return new Response(JSON.stringify({error:message,code}),{status,headers});
}

function requestBodyLimit(pathInfo){
  return pathInfo.media||pathInfo.live?LARGE_MEDIA_BODY_LIMIT:STANDARD_BODY_LIMIT;
}

function contentLengthTooLarge(request,limit){
  const raw=request.headers.get('content-length');
  if(!raw)return false;
  const value=Number(raw);
  return Number.isFinite(value)&&value>limit;
}

function isDocumentResponse(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  return type.includes('text/html')||type.includes('application/json');
}

export async function enforcePlatformRequestSecurity(request,env={}){
  const method=String(request.method||'GET').toUpperCase();
  const url=new URL(request.url);
  const pathInfo=classifyPath(url.pathname);

  if(BLOCKED_METHODS.has(method)){
    return securityError('허용되지 않은 HTTP 메서드입니다.','PLATFORM_METHOD_BLOCKED',405);
  }
  if(url.search.length>MAX_QUERY_LENGTH){
    return securityError('요청 주소의 조회 조건이 허용 범위를 초과했습니다.','PLATFORM_QUERY_TOO_LARGE',414);
  }
  if(MUTATION_METHODS.has(method)&&contentLengthTooLarge(request,requestBodyLimit(pathInfo))){
    return securityError('요청 본문이 허용 크기를 초과했습니다.','PLATFORM_BODY_TOO_LARGE',413);
  }
  if(!MUTATION_METHODS.has(method))return null;

  const identity=await identityFor(request);
  if(pathInfo.sensitive){
    const result=await limiterResult(env.PLATFORM_SENSITIVE_RATE_LIMITER,method+':'+pathInfo.surface+':'+identity);
    if(!result.available){
      if(String(env.ENVIRONMENT||'').toLowerCase()!=='production')return null;
      console.error('EKODI sensitive edge protection unavailable',{path:url.pathname,ray:request.headers.get('cf-ray')||''});
      return securityError('보안 보호장치가 일시적으로 사용할 수 없습니다.','PLATFORM_SECURITY_UNAVAILABLE',503,'30');
    }
    if(!result.allowed){
      console.warn('EKODI sensitive edge rate limit exceeded',{path:url.pathname,ray:request.headers.get('cf-ray')||''});
      return securityError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.','PLATFORM_SENSITIVE_RATE_LIMITED',429,'60');
    }
    return null;
  }

  const result=await limiterResult(env.PLATFORM_PUBLIC_WRITE_RATE_LIMITER,method+':public:'+identity);
  if(!result.available){
    if(String(env.ENVIRONMENT||'').toLowerCase()==='production'){
      console.error('EKODI public write edge protection unavailable',{path:url.pathname,ray:request.headers.get('cf-ray')||''});
      return securityError('보안 보호장치가 일시적으로 사용할 수 없습니다.','PLATFORM_SECURITY_UNAVAILABLE',503,'30');
    }
    return null;
  }
  if(!result.allowed){
    console.warn('EKODI public write rate limit exceeded',{path:url.pathname,ray:request.headers.get('cf-ray')||''});
    return securityError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.','PLATFORM_PUBLIC_WRITE_RATE_LIMITED',429,'60');
  }
  return null;
}

export function applyPlatformSecurityHeaders(response,request){
  const secured=new Response(response.body,response);
  const url=new URL(request.url);
  const info=classifyPath(url.pathname);
  const headers=secured.headers;

  headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Permitted-Cross-Domain-Policies','none');
  headers.set('Origin-Agent-Cluster','?1');
  if(!headers.has('Referrer-Policy'))headers.set('Referrer-Policy',info.sensitive?'no-referrer':'strict-origin-when-cross-origin');
  if(!headers.has('X-Frame-Options'))headers.set('X-Frame-Options','DENY');
  if(!headers.has('Permissions-Policy')){
    headers.set('Permissions-Policy',info.live
      ? 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), usb=()'
      : 'camera=(), microphone=(), display-capture=(), geolocation=(), usb=()');
  }
  if((info.admin||info.auth)&&!headers.has('Cross-Origin-Opener-Policy'))headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');
  if(info.sensitive){
    headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
    if(isDocumentResponse(secured))headers.set('Cache-Control','no-store');
  }
  headers.delete('X-Powered-By');
  headers.set('X-EKODI-Security-Policy','platform-edge-v2');
  headers.set('X-EKODI-Security-Surface',info.surface);
  return secured;
}

export const PLATFORM_SECURITY_CONSTANTS=Object.freeze({
  STANDARD_BODY_LIMIT,
  LARGE_MEDIA_BODY_LIMIT,
  MAX_QUERY_LENGTH,
});
