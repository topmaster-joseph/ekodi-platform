const TRACKING_QUERY_KEYS=new Set([
  'gclid','dclid','fbclid','msclkid','ttclid','twclid','li_fat_id','srsltid','igshid',
  'mc_cid','mc_eid','_ga','_gl','_hsenc','_hsmi'
]);
const SYSTEM_ROUTE_PREFIXES=['/api','/webhooks','/mcp','/health'];
const STATIC_ASSET_RE=/\.(?:js|mjs|css|map|json|xml|txt|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|pdf|zip)$/i;

export function isTrackingQueryParam(name){
  const key=String(name||'').trim().toLowerCase();
  return key.startsWith('utm_')||TRACKING_QUERY_KEYS.has(key);
}

export function isHumanFacingCanonicalRoute(pathname){
  const path=String(pathname||'/').toLowerCase();
  if(path.startsWith('/_ekodi/')||STATIC_ASSET_RE.test(path))return false;
  return !SYSTEM_ROUTE_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix+'/'));
}

export function stripTrackingQuery(urlLike){
  const url=urlLike instanceof URL?new URL(urlLike.toString()):new URL(String(urlLike));
  const removed=[];
  for(const key of [...url.searchParams.keys()]){
    if(!isTrackingQueryParam(key))continue;
    url.searchParams.delete(key);
    removed.push(key);
  }
  return {url,changed:removed.length>0,removed};
}

export function canonicalTrackingQueryRedirect(request){
  if(!request||!['GET','HEAD'].includes(String(request.method||'GET').toUpperCase()))return null;
  const source=new URL(request.url);
  if(!isHumanFacingCanonicalRoute(source.pathname))return null;
  const {url,changed}=stripTrackingQuery(source);
  if(!changed)return null;
  return new Response(null,{status:308,headers:{
    location:url.toString(),
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-ekodi-canonical-query':'tracking-params-removed'
  }});
}
