const MUTATION_METHODS=new Set(['POST','PUT','PATCH','DELETE']);
const STATIC_FILE=/\.(?:js|css|mjs|json|map|svg|png|webp|avif|ico|woff2?)$/i;
const SENSITIVE_PREFIXES=['/admin','/auth','/my','/api','/mcp','/webhooks'];
const SAFE_PUBLIC_TTL=new Map([
  ['/',60],
  ['/sitemap.xml',300],
  ['/llms.txt',300],
  ['/public-registry.json',300],
  ['/seonammedi',30],
  ['/seonammedi/',30],
]);
const TRACKING_KEYS=new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid']);
const inflight=new Map();
const MAX_INFLIGHT_KEYS=128;

function normalizedMethod(request){return String(request?.method||'GET').toUpperCase()}
function hasSensitivePrefix(pathname=''){const path=String(pathname||'').toLowerCase();return SENSITIVE_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix+'/'))}
function hasPrivateContext(request){
  return Boolean(request.headers.get('authorization')||request.headers.get('cookie')||request.headers.get('range'));
}
function hasOnlyTrackingQuery(url){
  if(!url.search)return true;
  for(const key of url.searchParams.keys())if(!TRACKING_KEYS.has(String(key).toLowerCase()))return false;
  return true;
}
function versioned(url){return url.searchParams.has('v')||url.searchParams.has('version')||url.searchParams.has('hash')}

export function classifyEdgeTrafficRequest(request){
  const method=normalizedMethod(request);
  const url=new URL(request.url);
  if(MUTATION_METHODS.has(method))return Object.freeze({id:'write',cacheable:false,cacheControl:'no-store'});
  if(!['GET','HEAD'].includes(method))return Object.freeze({id:'other',cacheable:false,cacheControl:'no-store'});
  if(hasSensitivePrefix(url.pathname))return Object.freeze({id:'private_or_sensitive',cacheable:false,cacheControl:'no-store'});
  if(hasPrivateContext(request))return Object.freeze({id:'private_context',cacheable:false,cacheControl:'private, no-store'});
  if(STATIC_FILE.test(url.pathname)){
    if(versioned(url))return Object.freeze({id:'immutable_static',cacheable:true,cacheControl:'public, max-age=31536000, immutable'});
    return Object.freeze({id:'revalidated_static',cacheable:true,cacheControl:'public, max-age=300, stale-while-revalidate=3600'});
  }
  const ttl=SAFE_PUBLIC_TTL.get(url.pathname);
  if(ttl&&hasOnlyTrackingQuery(url)){
    return Object.freeze({id:'safe_public_read',cacheable:true,edgeCache:true,ttl,cacheControl:`public, max-age=${ttl}, stale-while-revalidate=300`});
  }
  return Object.freeze({id:'public_dynamic',cacheable:false,cacheControl:'no-cache'});
}

export function applyEdgeTrafficPolicy(response,request,decision=classifyEdgeTrafficRequest(request)){
  const out=new Response(response.body,response);
  out.headers.set('X-EKODI-Edge-Cache-Policy',decision.id);
  if(decision.id==='write'||decision.id==='private_or_sensitive'||decision.id==='private_context')out.headers.set('Cache-Control',decision.cacheControl);
  else if(decision.cacheable&&!out.headers.has('Set-Cookie'))out.headers.set('Cache-Control',decision.cacheControl);
  return out;
}

function cacheKey(request){
  const url=new URL(request.url);
  for(const key of [...url.searchParams.keys()])if(TRACKING_KEYS.has(String(key).toLowerCase()))url.searchParams.delete(key);
  url.hash='';
  return new Request(url.toString(),{method:'GET',headers:{accept:request.headers.get('accept')||'*/*'}});
}

function cacheableResponse(response){
  return response&&response.status>=200&&response.status<300&&!response.headers.has('Set-Cookie');
}

function withCacheState(response,state){
  const out=new Response(response.body,response);
  out.headers.set('X-EKODI-Edge-Cache',state);
  return out;
}

export async function serveWithSafeEdgeCache(request,ctx,producer){
  const decision=classifyEdgeTrafficRequest(request);
  if(normalizedMethod(request)!=='GET'||!decision.edgeCache||typeof caches==='undefined'||!caches.default){
    return applyEdgeTrafficPolicy(await producer(),request,decision);
  }
  const cache=caches.default;
  const key=cacheKey(request);
  try{
    const hit=await cache.match(key);
    if(hit)return withCacheState(applyEdgeTrafficPolicy(hit,request,decision),'HIT');
  }catch(error){console.warn('[EKODI edge cache] read failed',error)}

  const id=key.url;
  if(inflight.has(id)){const shared=await inflight.get(id);return withCacheState(shared.clone(),'COALESCED');}
  const run=(async()=>{
    const produced=applyEdgeTrafficPolicy(await producer(),request,decision);
    if(cacheableResponse(produced)){
      const write=cache.put(key,produced.clone()).catch(error=>console.warn('[EKODI edge cache] write failed',error));
      if(ctx?.waitUntil)ctx.waitUntil(write);else await write;
    }
    return produced;
  })();
  if(inflight.size<MAX_INFLIGHT_KEYS)inflight.set(id,run);
  try{return withCacheState(await run,'MISS')}
  finally{if(inflight.get(id)===run)inflight.delete(id)}
}

export const EDGE_TRAFFIC_POLICY_CONSTANTS=Object.freeze({
  SAFE_PUBLIC_ROUTES:Object.freeze([...SAFE_PUBLIC_TTL.keys()]),
  SENSITIVE_PREFIXES:Object.freeze([...SENSITIVE_PREFIXES]),
  MAX_INFLIGHT_KEYS,
});
