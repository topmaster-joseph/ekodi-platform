import fs from 'node:fs/promises';

const manifestUrl=new URL('./public/insurance-law-sources.json',import.meta.url);
const manifest=JSON.parse(await fs.readFile(manifestUrl,'utf8'));
const failures=[];
const checked=[];

for(const [topicKey,topic] of Object.entries(manifest.topics||{})){
  for(const source of topic.sources||[]){
    try{
      const response=await fetch(source.url,{headers:{'user-agent':'EKODI-Insurance-Law-Watch/1.0 (+https://ekodi.kr)'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const text=await response.text();
      const missing=(source.markers||[]).filter(marker=>!text.includes(marker));
      if(missing.length)failures.push({topic:topicKey,id:source.id,url:source.url,missing});
      else checked.push({topic:topicKey,id:source.id,url:source.url});
    }catch(error){failures.push({topic:topicKey,id:source.id,url:source.url,error:String(error?.message||error)});}
  }
}

console.log(JSON.stringify({ok:failures.length===0,lastVerifiedAt:manifest.lastVerifiedAt,checked,failures},null,2));
if(failures.length){
  console.error('Official insurance law source markers changed or became unavailable. EKODI Insurance public legal copy requires review.');
  process.exit(1);
}
