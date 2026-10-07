import fs from 'node:fs';

const registry=JSON.parse(fs.readFileSync(new URL('../config/site-lifecycle-registry.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const provisioning=registry.boardProvisioning||{};
const eligibleClasses=new Set(provisioning.eligibleClasses||['workspace_user_site']);
const clean=value=>String(value??'').trim();
const path=value=>{
  const raw=clean(value)||'/';
  const normalized=('/'+raw.replace(/^\/+|\/+$/g,'')).replace(/\/{2,}/g,'/');
  return normalized==='/'?'/':normalized.replace(/\/$/,'');
};
const safe=value=>clean(value).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
function descriptor(entry){
  if(!entry||!eligibleClasses.has(String(entry.class||'workspace_user_site')))return null;
  let canonical;try{canonical=new URL(entry.canonicalUrl)}catch{return null}
  const alias=path(entry.pathAlias||'');
  const canonicalPath=canonical.hostname==='ekodi.kr'?path(canonical.pathname):(alias!=='/'?alias:'/');
  const derived=canonicalPath==='/'?'':canonicalPath.split('/').filter(Boolean).slice(-1)[0];
  const siteId=safe(entry.boardSiteId||derived||entry.id);
  if(!siteId)return null;
  const urls=new Set();
  if(canonical.hostname==='ekodi.kr'){
    urls.add('https://ekodi.kr'+canonicalPath+'/board/api/health');
  }else{
    urls.add(canonical.origin+'/board/api/health');
    if(alias!=='/')urls.add('https://ekodi.kr'+alias+'/board/api/health');
  }
  for(const domain of entry.customDomains||[]){
    let host='';try{host=new URL(String(domain).includes('://')?String(domain):'https://'+domain).hostname}catch{}
    if(host)urls.add('https://'+host+'/board/api/health');
  }
  return {siteId,urls:[...urls]};
}
const entries=[
  ...(registry.existingWorkspaceSites||[]).filter(site=>eligibleClasses.has(String(site.class||''))),
  ...(provisioning.independentSites||[]),
];
const descriptors=entries.map(descriptor).filter(Boolean);
const bySite=new Map();
for(const item of descriptors){
  const current=bySite.get(item.siteId)||new Set();
  for(const url of item.urls)current.add(url);
  bySite.set(item.siteId,current);
}
const targets=[...bySite.entries()].flatMap(([siteId,urls])=>[...urls].map(url=>({siteId,url})));

async function verify({siteId,url}){
  let last='';
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const response=await fetch(url,{redirect:'manual',headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
      const body=await response.text();
      const independent=response.headers.get('x-ekodi-board-independent')||'';
      const headerId=response.headers.get('x-ekodi-board-id')||'';
      let data=null;try{data=JSON.parse(body)}catch{}
      last=`HTTP ${response.status}; independent=${independent||'missing'}; boardId=${headerId||data?.boardId||'missing'}`;
      if(response.status===200&&independent==='true'&&headerId===`site:${siteId}:main`&&data?.ok===true&&data?.independent===true&&data?.boardId===`site:${siteId}:main`){
        console.log(`board verified: ${siteId} -> ${url}`);
        return {siteId,url,ok:true};
      }
    }catch(error){last=error?.message||String(error)}
    await new Promise(resolve=>setTimeout(resolve,1500*attempt));
  }
  throw new Error(`board verification failed: ${siteId} -> ${url}: ${last}`);
}

if(!targets.length)throw new Error('no eligible site board targets');
const results=await Promise.all(targets.map(verify));
const siteCount=new Set(results.map(item=>item.siteId)).size;
console.log(JSON.stringify({
  ok:true,
  policyId:provisioning.policyId,
  verifiedSites:siteCount,
  verifiedUrls:results.length,
  genericPlatformServicesExcludedByDefault:provisioning.genericPlatformServicesExcludedByDefault===true,
}));
