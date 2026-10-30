// EKODI / SeonamMedi public edge diagnostics only.
// Read-only HTTPS GET of two hard-coded owned sites; never log Cloudflare tokens,
// raw inline script, cookies, credentials or response HTML.
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';

const destinations=[
  {site:'ekodi-subpath',url:'https://ekodi.kr/seonammedi/'},
  {site:'customer',url:'https://seonammedi.kr/'}
];
function fingerprint(body){
  return String(body)
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,token=>
      token.includes('/cdn-cgi/challenge-platform/scripts/')?"'<cloudflare-loader-path>'":"'<literal>'")
    .replace(/[A-Za-z0-9+/=_-]{24,}/g,'<opaque>')
    .replace(/\s+/g,' ').slice(0,480);
}
function loaderMetadata(body){
  // Extract only safe taxonomy and lengths, never the inline loader URL itself.
  const hit=String(body).match(/var u='([^']*)',s=document\.createElement\('([^']*)'\)/);
  if(!hit)return {template:'unknown'};
  const literal=hit[1];
  const safePrefix='/cdn-cgi/challenge-platform/scripts/';
  const permitted=literal.startsWith(safePrefix);
  let kind='unknown',keys=[],queryLength=0;
  if(permitted){
    try{
      const url=new URL(literal,'https://ekodi.kr');
      if(url.origin==='https://ekodi.kr'){
        const relative=url.pathname.slice(safePrefix.length);
        kind=['precursor/main.js','jsd/main.js'].includes(relative)?relative:'other-first-party-script';
        keys=[...url.searchParams.keys()].map(key=>key.slice(0,48));
        queryLength=url.search.length;
      }
    }catch{}
  }
  const fallback=String(body).match(/catch\(e\)\{o='([^']*)'\}\}/);
  return {template:'origin-resolving-loader',kind,relativePathLength:literal.length,
    queryKeys:keys,queryLength,createsScript:hit[2]==='script',
    fallbackLiteralLength:fallback?fallback[1].length:null};
}
function inspectHtml(html){
  const text=String(html);
  const pattern=/<script(?:\s[^>]*)?>window\.__CF\$cv\$params=\{[^<]*?\};([^<]*?)<\/script>/g;
  const bodies=[...text.matchAll(pattern)].map(match=>match[1]);
  return {
    markerPresent:text.includes('__CF$cv$params'),
    loaderCount:bodies.length,
    loaderShapes:bodies.map(body=>({
      sha256:createHash('sha256').update(body).digest('hex'),
      length:body.length,
      redactedShape:fingerprint(body),
      metadata:loaderMetadata(body)
    })),
    unmatchedMarker:text.includes('__CF$cv$params')&&bodies.length===0
  };
}
const results=[];
for(const target of destinations){
  try{
    const r=await fetch(target.url,{redirect:'error',headers:{'cache-control':'no-cache'},
      signal:AbortSignal.timeout(15000)});
    const data=await r.text();
    results.push({site:target.site,status:r.status,contentType:String(r.headers.get('content-type')||'').split(';')[0],
      ...inspectHtml(data)});
  }catch(error){
    results.push({site:target.site,status:0,errorClass:error?.name||'RequestError'});
  }
}
const report={policy:'SEONAM-EDGE-JSD-DIAG-001',readOnly:true,
  timestamp:new Date().toISOString(),results};
await mkdir('artifacts/seonammedi-edge-jsd',{recursive:true});
await writeFile('artifacts/seonammedi-edge-jsd/redacted-report.json',JSON.stringify(report,null,2)+'\n');
for(const item of results)console.log(JSON.stringify(item));
if(results.some(item=>!item.status||item.status>=400))process.exitCode=1;
