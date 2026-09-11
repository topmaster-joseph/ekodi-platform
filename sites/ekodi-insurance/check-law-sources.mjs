import fs from 'node:fs/promises';

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

async function fetchOfficialLaw(value,depth=0){
  if(depth>5)throw new Error('too many official-law redirects');
  const url=officialLawUrl(value);
  const response=await fetch(url,{redirect:'manual',headers:{'user-agent':'EKODI-Insurance-Law-Watch/1.0 (+https://ekodi.kr)'}});
  if(response.status>=300&&response.status<400){
    const location=response.headers.get('location');
    if(!location)throw new Error('official-law redirect missing location');
    const next=new URL(location,url);
    officialLawUrl(next);
    return fetchOfficialLaw(next,depth+1);
  }
  return response;
}

for(const [topicKey,topic] of Object.entries(manifest.topics||{})){
  for(const source of topic.sources||[]){
    try{
      const response=await fetchOfficialLaw(source.url);
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const text=await response.text();
      const missing=(source.markers||[]).filter(marker=>!text.includes(marker));
      if(missing.length)failures.push({topic:topicKey,id:source.id,url:source.url,missing});
      else checked.push({topic:topicKey,id:source.id,url:source.url});
    }catch(error){
      failures.push({topic:topicKey,id:source.id,url:source.url,error:String(error?.message||error)});
    }
  }
}

console.log(JSON.stringify({ok:failures.length===0,lastVerifiedAt:manifest.lastVerifiedAt,officialHost:'law.go.kr',checked,failures},null,2));
if(failures.length){
  console.error('Official insurance law source markers changed or became unavailable. EKODI Insurance public legal copy requires review.');
  process.exit(1);
}
