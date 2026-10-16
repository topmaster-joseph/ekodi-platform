// CGMA-owned public, anonymous survey prototype. No write API or tenant membership access.
const PREFIX='/cgma/ai-education';
const ROUTE='cgma-ai-education-survey';
const CSP="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
export function isCgmaAiEducationPath(pathname){
  return pathname===PREFIX||pathname.startsWith(PREFIX+'/');
}
function policyResponse(status,message,extra={}){
  return new Response(message,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':ROUTE,...extra}});
}
export async function routeCgmaAiEducation(request,env){
  const url=new URL(request.url);
  if(!isCgmaAiEducationPath(url.pathname))return null;
  if(!['GET','HEAD'].includes(request.method))return policyResponse(405,'Method Not Allowed',{allow:'GET, HEAD'});
  if(url.pathname===PREFIX||url.pathname===PREFIX+'/index.html'){
    const target=new URL(request.url);target.pathname=PREFIX+'/';
    return policyResponse(308,null,{location:target.toString()});
  }
  const isDocument=url.pathname===PREFIX+'/';
  const isScript=url.pathname===PREFIX+'/app.js';
  if(!isDocument&&!isScript)return policyResponse(404,'Not Found');
  if(!env?.ASSETS?.fetch)return policyResponse(503,'Survey assets unavailable');
  let asset;
  try{asset=await env.ASSETS.fetch(request)}catch{return policyResponse(503,'Survey assets unavailable')}
  if(asset.status!==200)return policyResponse(503,'Survey assets unavailable');
  const mime=String(asset.headers.get('content-type')||'').toLowerCase();
  if(isDocument?!mime.includes('text/html'):!mime.includes('javascript'))return policyResponse(503,'Survey asset type unavailable');
  const response=new Response(asset.body,asset);
  response.headers.set('cache-control',isDocument?'no-store':'public, max-age=300');
  response.headers.set('x-content-type-options','nosniff');
  response.headers.set('x-ekodi-route',ROUTE);
  response.headers.set('x-ekodi-workspace','cgma');
  response.headers.set('x-robots-tag','noindex, nofollow');
  if(isDocument)response.headers.set('content-security-policy',CSP);
  return response;
}
