// SEARCH-SITEMAP-TARGET-EVIDENCE-001
// Read-only, fixed-origin inspection of a bounded sample from the *live*
// EKODI XML sitemap. This is NOT a Google URL Inspection or indexing result.
const ORIGIN='https://ekodi.kr';
const MAX_XML_BYTES=2_000_000;
const MAX_BODY_BYTES=192_000;
const MAX_SAMPLED_URLS=24;
const CONCURRENCY=4;
const TIMEOUT_MS=8_000;
const BLOCKED_PREFIXES=['/admin','/api','/auth','/oauth','/my','/preview','/workspace-admin'];

const attr=(tag,name)=>{
  for(const match of String(tag||'').matchAll(/([a-zA-Z-]+)\s*=\s*(["'])(.*?)\2/g))
    if(match[1].toLowerCase()===name)return match[3];
  return '';
};
const decodeXml=x=>String(x||'').replace(/&(?:amp|quot|apos|lt|gt);/g,entity=>({
  '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'
})[entity]);
const rotate=(items,index)=>items.length?items.slice(index%items.length).concat(items.slice(0,index%items.length)):[];
const dayNumber=iso=>{
  const date=Date.parse(String(iso||'').slice(0,10)+'T00:00:00Z');
  return Number.isFinite(date)?Math.floor(date/86_400_000):0;
};

export function extractEkodiSitemapUrls(xml){
  const source=String(xml||'');
  if(source.length>MAX_XML_BYTES)return {urls:[],total:0,invalid:0,duplicate:0,error:'sitemap_too_large'};
  if(!/<urlset\b/i.test(source))return {urls:[],total:0,invalid:0,duplicate:0,error:'sitemap_urlset_missing'};
  const urls=[],seen=new Set();
  let invalid=0,duplicate=0,total=0;
  for(const match of source.matchAll(/<loc>\s*([^<]{1,2500}?)\s*<\/loc>/gi)){
    total++;
    const candidate=decodeXml(match[1]).trim();
    try{
      const parsed=new URL(candidate);
      if(parsed.origin!==ORIGIN||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.port||
        !/^https:$/i.test(parsed.protocol)||
        BLOCKED_PREFIXES.some(p=>parsed.pathname===p||parsed.pathname.startsWith(p+'/'))) {
        invalid++;continue;
      }
      if(seen.has(parsed.href)){duplicate++;continue;}
      seen.add(parsed.href);urls.push(parsed.href);
    }catch{invalid++;}
  }
  return {urls,total,invalid,duplicate,error:null};
}

export function selectEkodiSitemapSample(urls,resources=[],now=new Date().toISOString(),limit=MAX_SAMPLED_URLS){
  const allowed=Math.max(1,Math.min(MAX_SAMPLED_URLS,Math.floor(Number(limit)||MAX_SAMPLED_URLS)));
  const roots=new Set((Array.isArray(resources)?resources:[])
    .filter(x=>x&&(x.type==='site'||x.source==='discovery-layer')&&typeof x.url==='string')
    .map(x=>x.url));
  const siteUrls=urls.filter(x=>roots.has(x));
  const pageUrls=urls.filter(x=>!roots.has(x));
  const day=dayNumber(now);
  const siteCount=Math.min(siteUrls.length,Math.ceil(allowed*2/3));
  let chosen=[...rotate(siteUrls,day).slice(0,siteCount),
    ...rotate(pageUrls,day).slice(0,allowed-siteCount)];
  if(chosen.length<allowed)
    chosen=[...chosen,...rotate(siteUrls,day+siteCount).filter(x=>!chosen.includes(x)).slice(0,allowed-chosen.length)];
  return chosen;
}

async function boundedHtml(response){
  if(!/text\/html/i.test(response.headers.get('content-type')||''))return null;
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>MAX_BODY_BYTES)throw new Error('response_too_large');
  const reader=response.body?.getReader?.();
  if(!reader){
    const body=await response.text();
    if(new TextEncoder().encode(body).byteLength>MAX_BODY_BYTES)throw new Error('response_too_large');
    return body;
  }
  const parts=[];let count=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    count+=value.byteLength;
    if(count>MAX_BODY_BYTES){await reader.cancel().catch(()=>{});throw new Error('response_too_large');}
    parts.push(value);
  }
  const bytes=new Uint8Array(count);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return new TextDecoder('utf-8').decode(bytes);
}

export function inspectEkodiSitemapResponse(url,response,body){
  const issues=[],status=Number(response?.status||0);
  const headers=response?.headers||new Headers();
  if([301,302,303,307,308].includes(status))issues.push('sitemap_redirect');
  else if(status!==200)issues.push('sitemap_http_'+status);
  else{
    if(/\b(?:noindex|none)\b/i.test(headers.get('x-robots-tag')||''))issues.push('sitemap_noindex_header');
    if(typeof body==='string'){
      const head=body.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]||'';
      const meta=[...head.matchAll(/<meta\b[^>]*>/gi)]
        .map(x=>x[0]).filter(x=>attr(x,'name').toLowerCase()==='robots');
      if(meta.some(x=>/\b(?:noindex|none)\b/i.test(attr(x,'content'))))
        issues.push('sitemap_noindex_meta');
      const canonical=[...head.matchAll(/<link\b[^>]*>/gi)]
        .map(x=>x[0]).find(x=>attr(x,'rel').toLowerCase().split(/\s+/).includes('canonical'));
      if(!canonical)issues.push('canonical_missing');
      else{
        try{
          const href=new URL(attr(canonical,'href'),url);
          if(href.href!==url)issues.push('sitemap_canonical_mismatch');
        }catch{issues.push('sitemap_canonical_invalid');}
      }
    }else issues.push('html_not_verified');
  }
  return {path:new URL(url).pathname,status,issues};
}

export async function auditEkodiSitemapTargets({xml,resources=[],fetchImpl=fetch,now=new Date().toISOString()}={}){
  const inventory=extractEkodiSitemapUrls(xml);
  const sample=selectEkodiSitemapSample(inventory.urls,resources,now);
  const results=[];let circuitOpen=false;
  for(let i=0;i<sample.length;i+=CONCURRENCY){
    if(circuitOpen)break;
    const batch=sample.slice(i,i+CONCURRENCY);
    const rows=await Promise.all(batch.map(async url=>{
      try{
        const response=await fetchImpl(url,{
          method:'GET',redirect:'manual',
          headers:{accept:'text/html,application/xhtml+xml','user-agent':'EKODI-Sitemap-Readonly-Audit/1.0'},
          signal:AbortSignal.timeout(TIMEOUT_MS)
        });
        if([429,503].includes(response.status)){
          circuitOpen=true;
          return {path:new URL(url).pathname,status:response.status,issues:['provider_rate_or_service_limit']};
        }
        const body=await boundedHtml(response);
        return inspectEkodiSitemapResponse(url,response,body);
      }catch(error){
        return {path:new URL(url).pathname,status:0,issues:[
          error?.message==='response_too_large'?'response_too_large':'public_fetch_unavailable'
        ]};
      }
    }));
    results.push(...rows);
  }
  const issueRows=results.filter(x=>x.issues.length);
  const summary={policy:'SEARCH-SITEMAP-TARGET-EVIDENCE-001',
    checkedAt:now,provider:'public_http_only',googleIndexVerified:false,
    totalLocs:inventory.total,uniquePublicUrls:inventory.urls.length,
    invalidLocs:inventory.invalid,duplicates:inventory.duplicate,
    sampled:results.length,sampleLimit:MAX_SAMPLED_URLS,
    partial:results.length<inventory.urls.length,
    circuitOpen,
    inventoryError:inventory.error,
    flagged:issueRows.length,
    issues:issueRows.slice(0,24)};
  return summary;
}
