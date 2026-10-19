// CGMA-owned 2026 motor festival pages on the canonical workspace path (no subdomain).
// Public application page + administrator page. Data access happens only through the Control API
// at /api/merchant-events/motor-festival-2026/applications, which enforces authority server-side.
const PREFIX='/cgma/motor-festival-2026';
const ROUTE='cgma-motor-festival-2026';
const CSP="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
const DOCUMENTS=new Map([[PREFIX+'/','public'],[PREFIX+'/admin/','admin']]);
const SCRIPTS=new Set([PREFIX+'/app.js',PREFIX+'/admin/app.js']);
export function isCgmaMotorFestivalPath(pathname){
  return pathname===PREFIX||pathname.startsWith(PREFIX+'/');
}
function policyResponse(status,message,extra={}){
  return new Response(message,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':ROUTE,...extra}});
}
export async function routeCgmaMotorFestival(request,env){
  const url=new URL(request.url);
  if(!isCgmaMotorFestivalPath(url.pathname))return null;
  if(!['GET','HEAD'].includes(request.method))return policyResponse(405,'Method Not Allowed',{allow:'GET, HEAD'});
  for(const base of [PREFIX,PREFIX+'/admin']){
    if(url.pathname===base||url.pathname===base+'/index.html'){
      const target=new URL(request.url);target.pathname=base+'/';
      return policyResponse(308,null,{location:target.toString()});
    }
  }
  const kind=DOCUMENTS.get(url.pathname);
  const isScript=SCRIPTS.has(url.pathname);
  if(!kind&&!isScript)return policyResponse(404,'Not Found');
  if(!env?.ASSETS?.fetch)return policyResponse(503,'Festival assets unavailable');
  let asset;
  // Strip conditional headers: the static-asset binding answers If-None-Match with 304, which the
  // status check below would otherwise turn into a 503 once the browser cache needs revalidation.
  try{asset=await env.ASSETS.fetch(new Request(url.toString(),{method:request.method}))}catch{return policyResponse(503,'Festival assets unavailable')}
  if(asset.status!==200)return policyResponse(503,'Festival assets unavailable');
  const mime=String(asset.headers.get('content-type')||'').toLowerCase();
  if(kind?!mime.includes('text/html'):!mime.includes('javascript'))return policyResponse(503,'Festival asset type unavailable');
  const response=new Response(asset.body,asset);
  response.headers.set('cache-control',kind?'no-store':'public, max-age=300');
  response.headers.set('x-content-type-options','nosniff');
  response.headers.set('x-ekodi-route',ROUTE);
  response.headers.set('x-ekodi-workspace','cgma');
  response.headers.set('referrer-policy','no-referrer');
  if(kind==='admin'||!kind)response.headers.set('x-robots-tag','noindex, nofollow');
  if(kind)response.headers.set('content-security-policy',CSP);
  return response;
}
