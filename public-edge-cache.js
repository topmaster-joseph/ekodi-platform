const EXACT_PROFILES = Object.freeze({
  '/api/seonammedi/page-data': Object.freeze({ id:'seonammedi-page-data', ttl:30, stale:120 }),
  '/api/seonammedi/timeline': Object.freeze({ id:'seonammedi-timeline', ttl:60, stale:180 }),
  '/api/seonammedi/channels': Object.freeze({ id:'seonammedi-channels', ttl:120, stale:300 }),
  '/api/seonammedi/content': Object.freeze({ id:'seonammedi-content', ttl:30, stale:120 }),
});

const PATTERN_PROFILES = Object.freeze([
  Object.freeze({ pattern:/^\/api\/seonammedi\/channels\/\d+\/preview$/, profile:Object.freeze({ id:'seonammedi-channel-preview', ttl:60, stale:180 }) }),
  Object.freeze({ pattern:/^\/api\/seonammedi\/notices\/\d+\/image\/\d+$/, profile:Object.freeze({ id:'seonammedi-notice-image', ttl:60, stale:300 }) }),
]);

function hasPersonalizedCredentials(request){
  return Boolean(String(request.headers.get('authorization')||'').trim() || String(request.headers.get('cookie')||'').trim());
}

export function publicEdgeCacheProfile(request){
  if(String(request.method||'GET').toUpperCase()!=='GET')return null;
  if(hasPersonalizedCredentials(request))return null;
  const url=new URL(request.url);
  if(url.searchParams.get('_refresh')==='1')return null;
  const exact=EXACT_PROFILES[url.pathname];
  if(exact)return exact;
  for(const item of PATTERN_PROFILES)if(item.pattern.test(url.pathname))return item.profile;
  return null;
}

function canonicalCacheKey(request){
  const url=new URL(request.url);
  url.protocol='https:';
  url.hostname='ekodi.kr';
  url.port='';
  url.hash='';
  return new Request(url.toString(),{method:'GET'});
}

function decorate(response,profile,state){
  const out=new Response(response.body,response);
  out.headers.set('cache-control',`public, max-age=${profile.ttl}, stale-while-revalidate=${profile.stale}`);
  out.headers.set('x-ekodi-cache-policy',`public-edge-v1;${profile.id}`);
  out.headers.set('x-ekodi-edge-cache',state);
  return out;
}

function cacheableResponse(response){
  if(!response||response.status!==200)return false;
  if(response.headers.has('set-cookie'))return false;
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  return type.includes('application/json')||type.startsWith('image/');
}

export async function withPublicEdgeCache(request,ctx,loader,cacheOverride){
  const profile=publicEdgeCacheProfile(request);
  if(!profile)return loader();

  const cache=cacheOverride===undefined?globalThis.caches?.default:cacheOverride;
  const key=canonicalCacheKey(request);
  if(cache?.match){
    try{
      const hit=await cache.match(key);
      if(hit)return decorate(hit,profile,'HIT');
    }catch(error){
      console.warn('EKODI public edge cache read failed',{profile:profile.id,error:String(error?.message||error)});
    }
  }

  const response=await loader();
  if(!cacheableResponse(response))return response;

  const decorated=decorate(response,profile,'MISS');
  if(cache?.put){
    const stored=decorate(response.clone(),profile,'STORED');
    const write=cache.put(key,stored).catch(error=>console.warn('EKODI public edge cache write failed',{profile:profile.id,error:String(error?.message||error)}));
    if(ctx?.waitUntil)ctx.waitUntil(write);else await write;
  }
  return decorated;
}

export const PUBLIC_EDGE_CACHE_PROFILES=Object.freeze({
  exact:EXACT_PROFILES,
  patterns:PATTERN_PROFILES.map(item=>Object.freeze({ pattern:String(item.pattern), profile:item.profile })),
});
