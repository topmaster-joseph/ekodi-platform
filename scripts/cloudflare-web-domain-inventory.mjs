import fs from 'node:fs';
import path from 'node:path';

const SELF_TEST = process.argv.includes('--self-test');
const ROOT = 'ekodi.kr';
const WEB_DNS = new Set(['A','AAAA','CNAME']);
const normalizeHost = value=>String(value||'').trim().toLowerCase().replace(/\.$/,'');
const isSubdomain = host=>normalizeHost(host).endsWith('.'+ROOT) && normalizeHost(host)!==ROOT;
function add(registry,host,kind,details={}){
  const name=normalizeHost(host);
  if(!isSubdomain(name))return;
  if(!registry.has(name))registry.set(name,{host:name,sources:[],dnsTypes:[],services:[]});
  const rec=registry.get(name);
  if(!rec.sources.includes(kind))rec.sources.push(kind);
  if(details.dnsType&&!rec.dnsTypes.includes(details.dnsType))rec.dnsTypes.push(details.dnsType);
  if(details.service&&!rec.services.includes(details.service))rec.services.push(details.service);
}
function classify(registry){
  return [...registry.values()].sort((a,b)=>a.host.localeCompare(b.host)).map(row=>{
    row.sources.sort();row.dnsTypes.sort();row.services.sort();
    row.hasHttpDns=row.dnsTypes.some(type=>WEB_DNS.has(type));
    row.hasWorkerBinding=row.sources.includes('worker-custom-domain')||row.sources.includes('worker-route');
    row.hasPagesDomain=row.sources.includes('pages-custom-domain');
    row.dnsOnlyUnknownPurpose=!row.hasWorkerBinding&&!row.hasPagesDomain&&row.hasHttpDns;
    row.emailOrVerificationRecord=row.dnsTypes.some(type=>['MX','TXT','CAA','SRV','TLSA'].includes(type));
    row.retirementStatus='unverified';
    return row;
  });
}
if(SELF_TEST){
  const test=new Map;
  add(test,'ADMIN.ekodi.kr','worker-custom-domain',{service:'ekodi-admin'});
  add(test,'admin.ekodi.kr.','dns',{dnsType:'CNAME'});
  add(test,'example.com','dns',{dnsType:'CNAME'});
  add(test,'mail.ekodi.kr','dns',{dnsType:'MX'});
  const rows=classify(test);
  if(rows.length!==2||rows[0].host!=='admin.ekodi.kr'||!rows[0].hasWorkerBinding||rows[1].emailOrVerificationRecord!==true)throw new Error('Inventory classification self-test failed');
  console.log('Cloudflare domain inventory self-test OK');
  process.exit(0);
}

const token=process.env.CLOUDFLARE_API_TOKEN||'';
const account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
const scope=process.env.EKODI_CF_SCOPE||'production';
if(!token||!account)throw new Error('Read-only Cloudflare inventory requires an authorized account ID and API token');
if(!['production','development'].includes(scope))throw new Error('Unrecognized account scope');
const api='https://api.cloudflare.com/client/v4';
const headers={Authorization:'Bearer '+token,Accept:'application/json'};

async function get(endpoint){
  for(let attempt=1;attempt<=3;attempt++){
    const response=await fetch(api+endpoint,{headers,signal:AbortSignal.timeout(15000)});
    if([429,502,503,504].includes(response.status)&&attempt<3){await new Promise(ok=>setTimeout(ok,attempt*800));continue}
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.success!==true){
      const codes=(data.errors||[]).map(e=>e.code||'unknown').join(',');
      throw new Error('Cloudflare inventory read failed HTTP '+response.status+' error codes '+codes+' on '+endpoint.split('?')[0]);
    }
    return data;
  }
  throw new Error('Cloudflare inventory retry exhausted');
}
async function pages(endpoint){
  const all=[];
  for(let page=1;page<=30;page++){
    const sep=endpoint.includes('?')?'&':'?';
    const data=await get(endpoint+sep+'page='+page+'&per_page=100');
    if(!Array.isArray(data.result))throw new Error('Unexpected Cloudflare list response');
    all.push(...data.result);
    if(data.result.length<100||page>=(data.result_info?.total_pages||Infinity))return all;
  }
  throw new Error('Inventory pagination exceeded 30 pages');
}
const registry=new Map;
const sourceCounts={workerCustomDomains:0,workerRoutes:0,pagesProjects:0,dnsRecords:0};

const domains=await pages('/accounts/'+account+'/workers/domains');
for(const domain of domains){sourceCounts.workerCustomDomains++;add(registry,domain.hostname,'worker-custom-domain',{service:domain.service})}
const projects=await pages('/accounts/'+account+'/pages/projects');
for(const project of projects){
  sourceCounts.pagesProjects++;
  for(const host of project.domains||[])add(registry,host,'pages-custom-domain',{service:project.name});
}
if(scope==='production'){
  const zones=await pages('/zones?name='+encodeURIComponent(ROOT)+'&status=active');
  const zone=zones.find(z=>z.name===ROOT);
  if(!zone?.id)throw new Error('EKODI production DNS zone not found; incomplete inventory');
  const dnsAll=await pages('/zones/'+zone.id+'/dns_records');
  for(const record of dnsAll){sourceCounts.dnsRecords++;add(registry,record.name,'dns',{dnsType:String(record.type||'').toUpperCase()})}
  const routes=await pages('/zones/'+zone.id+'/workers/routes');
  for(const route of routes){
    sourceCounts.workerRoutes++;
    const host=String(route.pattern||'').split('/')[0].replace(/^\*\./,'').replace(/\*$/,'');
    add(registry,host,'worker-route',{service:route.script||route.service||''});
  }
}
const hosts=classify(registry);
const output={generatedAt:new Date().toISOString(),scope,root:ROOT,sourceCounts,hostCount:hosts.length,hosts,complete:true,destructiveActions:0,warning:'DNS type or known hostname alone never authorizes deletion; verify traffic, callbacks, mail and rollout gates'};
const dest=process.env.EKODI_CF_INVENTORY_OUTPUT||'artifacts/cloudflare-web-domain-inventory-'+scope+'.json';
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify(output,null,2)+'\n');
const summary=process.env.GITHUB_STEP_SUMMARY;
const md='## Cloudflare web-domain read-only inventory ('+scope+')\n'
  +'- Active first-party subdomain candidates: **'+hosts.length+'**\n'
  +'- Worker Custom Domains: **'+sourceCounts.workerCustomDomains+'**, Pages projects: **'+sourceCounts.pagesProjects+'**\n'
  +'- Worker routes: **'+sourceCounts.workerRoutes+'**, DNS records inspected: **'+sourceCounts.dnsRecords+'**\n'
  +'- Hosts with Worker/Pages binding: **'+hosts.filter(x=>x.hasWorkerBinding||x.hasPagesDomain).length+'**\n'
  +'- DNS-only ambiguous hosts: **'+hosts.filter(x=>x.dnsOnlyUnknownPurpose).length+'**\n'
  +'- Deletions: **0**. No per-host retirement certified.\n';
if(summary)fs.appendFileSync(summary,md);
console.log(JSON.stringify({scope,hostCount:hosts.length,sourceCounts,report:dest,destructiveActions:0}));
