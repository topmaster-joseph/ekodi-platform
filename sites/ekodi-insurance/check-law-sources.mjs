import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const manifestUrl=new URL('./public/insurance-law-sources.json',import.meta.url);
const manifest=JSON.parse(await fs.readFile(manifestUrl,'utf8'));
const failures=[];
const checked=[];
const OFFICIAL_LAW_HOSTS=new Set(['law.go.kr','www.law.go.kr']);

function officialLawUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||!OFFICIAL_LAW_HOSTS.has(url.hostname)){
    throw new Error(`unapproved official law source: ${url.hostname}`);
  }
  return url;
}

function normalizeLawText(value){
  return String(value||'')
    .normalize('NFKC')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/[\s\u00a0]+/g,'')
    .trim();
}

async function fetchOfficialLaw(value,depth=0){
  if(depth>5)throw new Error('too many official-law redirects');
  const url=officialLawUrl(value);
  const response=await fetch(url,{redirect:'manual',headers:{'user-agent':'EKODI-Insurance-Law-Watch/1.2 (+https://ekodi.kr)'}});
  if(response.status>=300&&response.status<400){
    const location=response.headers.get('location');
    if(!location)throw new Error('official-law redirect missing location');
    const next=new URL(location,url);
    officialLawUrl(next);
    return fetchOfficialLaw(next,depth+1);
  }
  return response;
}

function pdfText(buffer){
  const result=spawnSync('pdftotext',['-layout','-','-'],{input:buffer,maxBuffer:20*1024*1024,encoding:'utf8'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`pdftotext failed: ${String(result.stderr||'').trim()||`exit ${result.status}`}`);
  return result.stdout;
}

for(const [topicKey,topic] of Object.entries(manifest.topics||{})){
  for(const source of topic.sources||[]){
    try{
      const response=await fetchOfficialLaw(source.url);
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const format=String(source.format||'html').toLowerCase();
      let text='';
      if(format==='pdf'){
        const bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.length<1000)throw new Error(`official PDF response too small: ${bytes.length} bytes`);
        if(bytes.subarray(0,5).toString('ascii')!=='%PDF-')throw new Error(`expected PDF magic, received ${response.headers.get('content-type')||'unknown content-type'}`);
        text=pdfText(bytes);
      }else{
        text=await response.text();
      }
      const normalizedText=normalizeLawText(text);
      const missing=(source.markers||[]).filter(marker=>!normalizedText.includes(normalizeLawText(marker)));
      if(missing.length)failures.push({topic:topicKey,id:source.id,url:source.url,format,missing});
      else checked.push({topic:topicKey,id:source.id,url:source.url,format});
    }catch(error){
      failures.push({topic:topicKey,id:source.id,url:source.url,format:source.format||'html',error:String(error?.message||error)});
    }
  }
}

console.log(JSON.stringify({ok:failures.length===0,lastVerifiedAt:manifest.lastVerifiedAt,officialHost:'law.go.kr',checked,failures},null,2));
if(failures.length){
  console.error('Official insurance law source markers changed or became unavailable. EKODI Insurance public legal copy requires review.');
  process.exit(1);
}
