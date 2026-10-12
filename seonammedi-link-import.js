import {hasRegionalMedicalContext} from './seonammedi-relevance.js';

const MAX_HTML_BYTES=600000;
const META_LIMIT=250000;
const clean=(value,max=1000)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const decode=value=>String(value??'').replace(/&#(x[0-9a-f]+|\d+);?/gi,(whole,raw)=>{
  const code=raw.toLowerCase().startsWith('x')?parseInt(raw.slice(1),16):parseInt(raw,10);
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):whole;
}).replace(/&(?:amp|quot|apos|#39|lt|gt|nbsp);/gi,s=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '}[s.toLowerCase()]||s));
const strip=value=>clean(decode(String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')),3500);
const meta=(html,name)=>{
  for(const tag of String(html||'').match(/<meta\b[^>]*>/gi)||[]){
    const attrs=Object.fromEntries([...tag.matchAll(/([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(m=>[m[1].toLowerCase(),m[2]??m[3]??'']));
    if((attrs.name||attrs.property||attrs.itemprop||'').toLowerCase()===name.toLowerCase())return clean(decode(attrs.content||''),3500);
  }
  return'';
};

export function safeImportUrl(input){
  let url;
  try{url=new URL(String(input||''))}catch{return null}
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.href.length>2048)return null;
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!host||!host.includes('.')||host.includes(':')||host.startsWith('['))return null;
  if(host==='localhost'||host.endsWith('.localhost')||/\.(?:local|internal|test|invalid|onion)$/.test(host))return null;
  if(host==='ekodi.kr'||host.endsWith('.ekodi.kr')||host==='seonammedi.kr')return null;
  if(/^\d+(?:\.\d+){3}$/.test(host)){
    const p=host.split('.').map(Number);
    if(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===198&&p[1]>=18&&p[1]<=19)return null;
    // No raw IP destinations needed for public source publishing.
    return null;
  }
  if(!/^[a-z0-9.-]+$/.test(host)||host.split('.').some(p=>!p||p.startsWith('-')||p.endsWith('-')))return null;
  url.hash='';
  return url.href;
}
const YYYYMMDD=/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/;
const getDate=value=>{
  const m=clean(value,100).match(YYYYMMDD);
  if(!m)return'';
  const [y,mo,d]=[Number(m[1]),Number(m[2]),Number(m[3])];
  const date=new Date(Date.UTC(y,mo-1,d));
  if(y<1990||date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d||date.getTime()>Date.now()+86400000)return'';
  return [y,String(mo).padStart(2,'0'),String(d).padStart(2,'0')].join('.');
};
export function extractSeonamMediArticle(html,sourceUrl){
  const title=strip(meta(html,'og:title')||meta(html,'twitter:title')||(String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]).slice(0,220);
  const description=strip(meta(html,'og:description')||meta(html,'description')||meta(html,'twitter:description'));
  const articleHtml=(String(html).match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)||[])[1]||'';
  const body=strip(articleHtml);
  const articleEvidence=body.length>=60?body:description;
  const evidence=hasRegionalMedicalContext(articleEvidence)?articleEvidence:'';
  const date=getDate(meta(html,'article:published_time')||meta(html,'datePublished')||meta(html,'date')||(String(html).match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)||[])[1]||'');
  const url=new URL(sourceUrl);
  const publisher=clean(meta(html,'og:site_name')||url.hostname,160);
  const relevant=hasRegionalMedicalContext(title)&&Boolean(evidence);
  const category=/후보대학|후보 대학|선정 절차|심사자료/.test(title+' '+evidence)?'후보대학 선정':/비대위|대책위|시민대회|상경투쟁|기자회견|집회|결의대회/.test(title+' '+evidence)?'비대위 활동이력':'정부·대학';
  return {title,summary:clean(evidence,240),publisher,date,category,sourceUrl,relevant,ready:relevant&&Boolean(date)};
}
export async function fetchSeonamMediLinkPreview(input,{fetchImpl=fetch}={}){
  let target=safeImportUrl(input);
  if(!target)throw new Error('invalid_source_url');
  const visited=new Set();
  for(let n=0;n<4;n++){
    if(visited.has(target))throw new Error('source_redirect_loop');
    visited.add(target);
    const response=await fetchImpl(target,{redirect:'manual',headers:{accept:'text/html,application/xhtml+xml','user-agent':'EKODI-SeonamMedi-LinkPreview/1.0'},signal:AbortSignal.timeout(6500)});
    if([301,302,303,307,308].includes(response.status)){
      const next=response.headers.get('location');
      const destination=next?safeImportUrl(new URL(next,target).href):null;
      if(!destination)throw new Error('unsafe_source_redirect');
      target=destination;continue;
    }
    if(!response.ok)throw new Error('source_unavailable');
    if(!/(?:text\/html|application\/xhtml\+xml)/i.test(response.headers.get('content-type')||''))throw new Error('source_not_html');
    if(Number(response.headers.get('content-length')||0)>MAX_HTML_BYTES)throw new Error('source_too_large');
    const reader=response.body?.getReader?.();
    let html='';
    if(reader){
      const chunks=[];let bytes=0;
      try{
        while(true){
          const {value,done}=await reader.read();
          if(done)break;
          bytes+=value.byteLength;
          if(bytes>MAX_HTML_BYTES)throw new Error('source_too_large');
          chunks.push(value);
        }
      }finally{reader.releaseLock()}
      html=new TextDecoder().decode(Uint8Array.from(chunks.flatMap(v=>Array.from(v))));
    }else html=(await response.text()).slice(0,MAX_HTML_BYTES);
    return extractSeonamMediArticle(html.slice(0,META_LIMIT),target);
  }
  throw new Error('source_too_many_redirects');
}
