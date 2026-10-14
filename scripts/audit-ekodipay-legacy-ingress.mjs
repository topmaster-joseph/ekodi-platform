// EKODI Pay exact-host Cloudflare exposure inventory (READ ONLY).
import fs from 'node:fs/promises';
const hosts=[['pay','ekodi','kr'],['pay','biz','ekodi','kr']].map(parts=>parts.join('.'));
export function routeIsExactHost(pattern,host){return String(pattern||'').split('/')[0].toLowerCase()===host;}
export function exposure({domains=[],routes=[],dns=[],httpStatus=0}={}){
 const records=dns.filter(x=>['A','AAAA','CNAME'].includes(String(x.type||'').toUpperCase()));
 return {workerDomains:domains.length,exactRoutes:routes.length,addressRecords:records.length,
         publiclyReachable:httpStatus>=200&&httpStatus<400,
         sourceOfTruthClean:!domains.length&&!routes.length&&!records.length,
         verifiedPrivate:false};
}
async function run(){
 if(process.argv.includes('--test-targets')){
  if(hosts.length!==2||hosts.some(x=>!x.endsWith('.ekodi.kr')))throw Error('invalid targets');
  console.log('Two exact EKODI Pay legacy hosts, audit-only');
  return;
 }
 const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CLOUDFLARE_ACCOUNT_ID;
 if(!token||!account)throw Error('Cloudflare audit read credentials missing');
 const read=async p=>{
  const response=await fetch('https://api.cloudflare.com/client/v4'+p,{
   headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.success!==true||!Array.isArray(data.result))throw Error('Cloudflare audit source unavailable (HTTP '+response.status+')');
  return data.result;
 };
 const zones=await read('/zones?name=ekodi.kr&status=active&per_page=50');
 const zone=zones.find(x=>x.name==='ekodi.kr');
 if(!zone?.id)throw Error('canonical zone ownership not verified');
 const [domains,routes]=await Promise.all([
   read('/accounts/'+encodeURIComponent(account)+'/workers/domains?per_page=100'),
   read('/zones/'+zone.id+'/workers/routes?per_page=100')
 ]);
 let healthy=false;
 try{const h=await fetch('https://ekodi.kr/ekodipay/api/health',{signal:AbortSignal.timeout(15000)});
  const x=h.ok?await h.json():null;
  healthy=h.status===200&&x?.service==='ekodipay'&&
    x?.realMoneyProcessing==='disabled-until-human-approved-pg-activation';
 }catch{}
 const results=[];
 for(const host of hosts){
   const d=(await read('/zones/'+zone.id+'/dns_records?name='+encodeURIComponent(host)+'&per_page=100'))
      .filter(x=>String(x.name||'').toLowerCase()===host);
   const ds=domains.filter(x=>String(x.hostname||'').toLowerCase()===host);
   const rs=routes.filter(x=>routeIsExactHost(x.pattern,host));
   let httpStatus=0,probe='inconclusive';
   try{const resp=await fetch('https://'+host+'/',{redirect:'manual',signal:AbortSignal.timeout(10000)});
     httpStatus=resp.status;probe='http';}catch{probe='transport-failed';}
   const status=exposure({domains:ds,routes:rs,dns:d,httpStatus});
   results.push({host,...status,probe,httpStatus,domainServices:ds.map(x=>String(x.service||'unknown')),
    routeScripts:rs.map(x=>String(x.script||'unknown')),
    recordTypes:d.map(x=>String(x.type||''))});
 }
 const result={policy:'EKODIPAY-LEGACY-AUDIT-001',readOnly:true,checkedAt:new Date().toISOString(),
  canonical:'https://ekodi.kr/ekodipay',canonicalHealthy:healthy,hosts:results,
  allPrivateVerified:false,
  note:'Read-only inventory. No host may be called private without authoritative DNS and negative live HTTP evidence.'};
 await fs.mkdir('artifacts',{recursive:true});
 await fs.writeFile('artifacts/ekodipay-legacy-ingress-audit.json',JSON.stringify(result,null,2)+'\n');
 console.log('EKODI Pay legacy ingress audit: canonicalHealthy='+healthy);
 for(const x of results)console.log(x.host+': domains='+x.workerDomains+', exactRoutes='+x.exactRoutes+
     ', addressDNS='+x.addressRecords+', HTTP='+x.httpStatus+' ('+x.probe+')');
 if(process.env.GITHUB_STEP_SUMMARY){
  let summary='### EKODI Pay legacy-domain read-only audit\n- Canonical Pay healthy and real-money disabled: '+healthy+'\n';
  for(const x of results)summary+='- '+x.host+': Worker domains='+x.workerDomains+', routes='+x.exactRoutes+', address DNS='+x.addressRecords+', probe='+x.probe+'/'+x.httpStatus+'\n';
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
 }
 if(!healthy)process.exitCode=1;
}
if(import.meta.url.endsWith('/audit-ekodipay-legacy-ingress.mjs'))
 run().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
