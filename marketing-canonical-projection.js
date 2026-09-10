const HIDDEN_UI_ORIGINS=Object.freeze(['https://marketing.ekodi.kr','https://jadam.ai.ekodi.kr','https://pizzamaru.ai.ekodi.kr','https://yogurt.ai.ekodi.kr','https://cgma.ai.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurt.ekodi.kr','https://marketing.jadam.ekodi.kr','https://marketing.pizzamaru.ekodi.kr','https://marketing.yogurt.ekodi.kr','https://marketing.cheonggye.ekodi.kr']);

const PROJECTIONS = [
  { prefix:'/ekodibiz/marketing-ai', sourceOrigin:'https://marketing.ekodi.kr', entryPath:'/', tenant:null, hiddenOrigins:HIDDEN_UI_ORIGINS },
  { prefix:'/jadam/marketing', sourceOrigin:'https://jadam.ai.ekodi.kr', entryPath:'/', tenant:'jadam', hiddenOrigins:HIDDEN_UI_ORIGINS },
  { prefix:'/pizzamaru/marketing', sourceOrigin:'https://pizzamaru.ai.ekodi.kr', entryPath:'/', tenant:'pizzamaru', hiddenOrigins:HIDDEN_UI_ORIGINS },
  { prefix:'/yogurt/marketing', sourceOrigin:'https://yogurt.ai.ekodi.kr', entryPath:'/', tenant:'yogurt', hiddenOrigins:HIDDEN_UI_ORIGINS },
  { prefix:'/cgma/marketing', sourceOrigin:'https://cgma.ai.ekodi.kr', entryPath:'/market-ai', tenant:'cgma', hiddenOrigins:HIDDEN_UI_ORIGINS },
];

export const MARKETING_CANONICAL_PROJECTIONS = Object.freeze(PROJECTIONS.map(item=>Object.freeze({...item,hiddenOrigins:Object.freeze([...item.hiddenOrigins])})));

export function marketingProjectionForPath(pathname){
  const path=String(pathname||'');
  return MARKETING_CANONICAL_PROJECTIONS.find(item=>path===item.prefix||path===`${item.prefix}/`||path.startsWith(`${item.prefix}/`))||null;
}

function sourceUrlFor(requestUrl,projection){
  const incoming=new URL(requestUrl);
  const target=new URL(projection.sourceOrigin);
  const suffix=incoming.pathname.slice(projection.prefix.length);
  target.pathname=!suffix||suffix==='/'?projection.entryPath:suffix;
  target.search=incoming.search;
  return target;
}
function canonicalReference(value,projection){
  const raw=String(value||'').trim();
  if(!raw||raw.startsWith('#')||/^(?:data|mailto|tel|javascript):/i.test(raw)||raw.startsWith('//'))return value;
  try{
    const sourceBase=new URL(projection.entryPath,`${projection.sourceOrigin}/`);
    const resolved=new URL(raw,sourceBase);
    if(resolved.origin!==projection.sourceOrigin)return value;
    const path=resolved.pathname===projection.entryPath?projection.prefix:`${projection.prefix}${resolved.pathname}`;
    return `${path}${resolved.search}${resolved.hash}`;
  }catch{return value}
}

function scrubHiddenOrigins(text,projection){
  let out=String(text||'');
  const canonical=`https://ekodi.kr${projection.prefix}`;
  const hosts=[];
  for(const origin of projection.hiddenOrigins){
    out=out.split(`${origin}/`).join(`${canonical}/`);
    out=out.split(origin).join(canonical);
    out=out.split(encodeURIComponent(`${origin}/`)).join(encodeURIComponent(`${canonical}/`));
    out=out.split(encodeURIComponent(origin)).join(encodeURIComponent(canonical));
    try{hosts.push(new URL(origin).hostname)}catch{}
  }
  for(const host of [...new Set(hosts)].sort((a,b)=>b.length-a.length)){
    const visible=`ekodi.kr${projection.prefix}`;
    out=out.split(host).join(visible);
    out=out.split(encodeURIComponent(host)).join(encodeURIComponent(visible));
  }
  return out;
}

export function rewriteMarketingCanonicalScript(script,projection){
  let out=scrubHiddenOrigins(script,projection);
  out=out.replace(/ALLOWED\.has\(location\.origin\)\|\|dynamicAiOrigin\(\)/g,"location.origin==='https://ekodi.kr'||ALLOWED.has(location.origin)||dynamicAiOrigin()");
  out=out.replace(/const dynamicAiOrigin=\(\)=>location\.protocol==='https:'&&\/\^\[a-z0-9-\]\+\\\.ai\\\.ekodi\\\.kr\$\/i\.test\(location\.hostname\);/g,'const dynamicAiOrigin=()=>false;');
  if(projection.tenant)out=out.replace(/const preferredTenant=ORIGIN_TENANT\[location\.origin\]\|\|'';/g,`const preferredTenant=${JSON.stringify(projection.tenant)}||ORIGIN_TENANT[location.origin]||'';`);
  return out;
}

export function rewriteMarketingCanonicalHtml(html,projection){
  let out=String(html||'').replace(/\b(href|src|action)=(['"])([^'"]*)\2/gi,(match,attr,quote,value)=>`${attr}=${quote}${canonicalReference(value,projection)}${quote}`);
  return rewriteMarketingCanonicalScript(out,projection);
}
export function rewriteMarketingCanonicalCss(css,projection){
  return String(css||'').replace(/url\((['"]?)([^)'"\s]+)\1\)/gi,(match,quote,value)=>{
    const rewritten=canonicalReference(value,projection);
    return `url(${quote}${rewritten}${quote})`;
  });
}

function projectedHeaders(upstream,projection,contentChanged){
  const headers=new Headers(upstream.headers);
  for(const name of ['content-length','content-encoding','etag','last-modified','set-cookie','location'])headers.delete(name);
  headers.set('x-ekodi-route','marketing-canonical-projection');
  headers.set('x-content-type-options','nosniff');
  if(projection.tenant)headers.set('cache-control','private, no-store, max-age=0');
  else if(contentChanged)headers.set('cache-control','public, max-age=0, must-revalidate');
  return headers;
}

export async function proxyCanonicalMarketing(request,fetcher=fetch){
  const incoming=new URL(request.url);
  const projection=marketingProjectionForPath(incoming.pathname);
  if(!projection)return null;
  if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  const target=sourceUrlFor(request.url,projection);
  const headers=new Headers();
  for(const name of ['accept','accept-language','user-agent']){const value=request.headers.get(name);if(value)headers.set(name,value)}
  try{
    const upstream=await fetcher(target.toString(),{method:request.method,headers,redirect:'follow'});
    const type=(upstream.headers.get('content-type')||'').toLowerCase();
    if(request.method==='HEAD')return new Response(null,{status:upstream.status,statusText:upstream.statusText,headers:projectedHeaders(upstream,projection,false)});
    if(type.includes('text/html')){
      const body=rewriteMarketingCanonicalHtml(await upstream.text(),projection);
      return new Response(body,{status:upstream.status,statusText:upstream.statusText,headers:projectedHeaders(upstream,projection,true)});
    }
    if(type.includes('javascript')){
      const body=rewriteMarketingCanonicalScript(await upstream.text(),projection);
      return new Response(body,{status:upstream.status,statusText:upstream.statusText,headers:projectedHeaders(upstream,projection,true)});
    }
    if(type.includes('text/css')){
      const body=rewriteMarketingCanonicalCss(await upstream.text(),projection);
      return new Response(body,{status:upstream.status,statusText:upstream.statusText,headers:projectedHeaders(upstream,projection,true)});
    }
    return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:projectedHeaders(upstream,projection,false)});
  }catch{
    return new Response('Marketing service temporarily unavailable',{status:503,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','x-ekodi-route':'marketing-canonical-projection'}});
  }
}
