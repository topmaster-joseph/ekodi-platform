// 청계면상인회 전자서명 페이지 (/cgma/sign/#<token>) on the canonical workspace path (no subdomain).
// Static page + script only; the signing token stays in the URL fragment (never sent to this route) and
// is presented to the Control API (/api/cgma/edocs/sign) in a header, which enforces order and authority.
const PREFIX='/cgma/sign';
const ROUTE='cgma-edoc-sign';
const CSP="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data: blob:; frame-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
const DOCUMENT=PREFIX+'/';
const SCRIPT=PREFIX+'/app.js';
export function isCgmaEdocSignPath(pathname){
  return pathname===PREFIX||pathname.startsWith(PREFIX+'/');
}
function policyResponse(status,message,extra={}){
  return new Response(message,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':ROUTE,'x-robots-tag':'noindex, nofollow',...extra}});
}
export async function routeCgmaEdocSign(request,env){
  const url=new URL(request.url);
  if(!isCgmaEdocSignPath(url.pathname))return null;
  if(!['GET','HEAD'].includes(request.method))return policyResponse(405,'Method Not Allowed',{allow:'GET, HEAD'});
  if(url.pathname===PREFIX||url.pathname===PREFIX+'/index.html'){
    const target=new URL(request.url);target.pathname=DOCUMENT;
    return policyResponse(308,null,{location:target.toString()});
  }
  const isDocument=url.pathname===DOCUMENT;
  if(!isDocument&&url.pathname!==SCRIPT)return policyResponse(404,'Not Found');
  if(!env?.ASSETS?.fetch)return policyResponse(503,'Signing page unavailable');
  let asset;
  // Conditional headers are stripped: a 304 from the asset binding must not become a 503 here.
  try{asset=await env.ASSETS.fetch(new Request(url.toString(),{method:request.method}))}catch{return policyResponse(503,'Signing page unavailable')}
  if(asset.status!==200)return policyResponse(503,'Signing page unavailable');
  const mime=String(asset.headers.get('content-type')||'').toLowerCase();
  if(isDocument?!mime.includes('text/html'):!mime.includes('javascript'))return policyResponse(503,'Signing page asset type unavailable');
  const response=new Response(asset.body,asset);
  response.headers.set('cache-control',isDocument?'no-store':'public, max-age=300');
  response.headers.set('x-content-type-options','nosniff');
  response.headers.set('x-ekodi-route',ROUTE);
  response.headers.set('x-ekodi-workspace','cgma');
  response.headers.set('referrer-policy','no-referrer');
  response.headers.set('x-robots-tag','noindex, nofollow');
  if(isDocument)response.headers.set('content-security-policy',CSP);
  return response;
}
