// Audited, read-only Cloudflare resource inventory for a publisher-private manuscript
// service. This intentionally never fetches account secrets, objects, or manuscript bytes.
const RULE=/^[a-z0-9][a-z0-9._-]{1,90}$/i;
const privateNamed=name=>/publishing|jubilee/i.test(name)&&/private|editorial|ingest/i.test(name);
const unique=xs=>[...new Set(xs)].sort();

export function summarizeJubileePublisherInfra({r2Buckets,d1Databases,workerScripts}){
  for(const source of [r2Buckets,d1Databases,workerScripts])
    if(!Array.isArray(source)||source.some(x=>typeof x!=='string'||!RULE.test(x)))
      throw Error('JUBILEE_INFRA_INVENTORY_MALFORMED');
  const r2=unique(r2Buckets.filter(privateNamed));
  const d1=unique(d1Databases.filter(privateNamed));
  const worker=unique(workerScripts.filter(privateNamed));
  return Object.freeze({
    privateR2CandidateCount:r2.length,privateD1CandidateCount:d1.length,
    privateWorkerCandidateCount:worker.length,
    r2Candidates:r2,d1Candidates:d1,workerCandidates:worker,
    // A resource merely existing never proves bindings, isolation or receipt persistence.
    privateIngestionReady:false,
    remaining:'binding,service-caller-auth,trusted-intent,private-D1-schema,verified-source-transport,private-readback-receipt',
  });
}

async function cloudflareGet(path){
  const token=process.env.CLOUDFLARE_API_TOKEN;
  const account=process.env.CLOUDFLARE_ACCOUNT_ID;
  if(!token||!account||!/^[a-f0-9]{32}$/i.test(account))
    throw Error('JUBILEE_CLOUDFLARE_PROTECTED_CREDENTIALS_MISSING');
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/'+path;
  let response;
  try{
    response=await fetch(url,{
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(14000),
    });
  }catch{throw Error('JUBILEE_CLOUDFLARE_AUDIT_CONNECTION_FAILED:'+path.split('/')[0]);}
  if(!response.ok)throw Error('JUBILEE_CLOUDFLARE_AUDIT_READ_DENIED:'+path.split('/')[0]+':'+response.status);
  let body;try{body=await response.json();}catch{throw Error('JUBILEE_CLOUDFLARE_AUDIT_JSON_INVALID');}
  if(body?.success!==true)throw Error('JUBILEE_CLOUDFLARE_AUDIT_RESPONSE_FAILED');
  return body;
}

async function listPaginated(path,extract){
  const all=[];let page=1;
  while(page<=15){
    const u=path+(path.includes('?')?'&':'?')+'per_page=100&page='+page;
    const body=await cloudflareGet(u);
    const records=extract(body);
    if(!Array.isArray(records))throw Error('JUBILEE_CLOUDFLARE_AUDIT_SHAPE_INVALID');
    all.push(...records.map(x=>String(x?.name||x?.id||'')));
    if(all.length>1500)throw Error('JUBILEE_CLOUDFLARE_AUDIT_TOO_MANY_ITEMS');
    const info=body.result_info||{};
    if(!info.total_pages||page>=info.total_pages)break;
    page++;
  }
  if(page>15)throw Error('JUBILEE_CLOUDFLARE_AUDIT_PAGINATION_LIMIT');
  return all;
}

export async function auditJubileePublisherResources(){
  const [r2,d1,workers]=await Promise.all([
    listPaginated('r2/buckets',b=>b.result?.buckets??b.result),
    listPaginated('d1/database',b=>b.result),
    listPaginated('workers/scripts',b=>b.result),
  ]);
  return summarizeJubileePublisherInfra({r2Buckets:r2,d1Databases:d1,workerScripts:workers});
}

if(process.argv[1]?.replaceAll('\\','/').endsWith('/audit-jubilee-publisher-infra.mjs')){
  const report=await auditJubileePublisherResources();
  for(const key of ['privateR2CandidateCount','privateD1CandidateCount','privateWorkerCandidateCount','privateIngestionReady'])
    console.log('JUBILEE_INFRA_'+key+'='+report[key]);
  for(const [type,names] of Object.entries({
    privateR2:report.r2Candidates,privateD1:report.d1Candidates,privateWorker:report.workerCandidates,
  }))console.log('JUBILEE_INFRA_'+type+'_NAMES='+(names.join(',')||'(none)'));
  console.log('JUBILEE_INFRA_REMAINING='+report.remaining);
  console.log('JUBILEE_INFRA_AUDIT_READ_ONLY_COMPLETED');
}
