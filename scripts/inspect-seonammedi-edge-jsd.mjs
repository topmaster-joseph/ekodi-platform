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
      redactedShape:fingerprint(body)
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
