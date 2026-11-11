// Read-only EKODI site-AI fleet overview; site improvement is not AI activation proof.
const clean=(v,max=120)=>String(v??'').trim().slice(0,max);
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const SHA=/^[0-9a-f]{40}$/i;
const STATES=new Set(['claimed','queued','running','cloud_dispatched','completed','failed','blocked','no_change','production_verified','staging','merged','awaiting_release']);
function eligibleSite(site){
  if(!site||site.class!=='workspace_user_site'||/^(planned|preparing|pending)/i.test(clean(site.migrationState,40)))return false;
  try{
    const url=new URL(site.canonicalUrl);
    return url.origin==='https://ekodi.kr'&&!url.search&&!url.hash&&!url.username&&!url.password&&/^\/[a-z0-9-]+\/?$/i.test(url.pathname);
  }catch{return false;}
}
function latestRunRows(rows){
  const map=new Map();
  for(const row of Array.isArray(rows)?rows.slice(0,100):[]){
    if(!row||typeof row!=='object')continue;
    const siteId=clean(row.site_id,100),day=clean(row.run_day,20);
    if(!siteId||!DAY.test(day))continue;
    const current=map.get(siteId);
    if(!current||day>current.runDay){
      const state=clean(row.state,40).toLowerCase();
      map.set(siteId,Object.freeze({
        runDay:day,
        state:STATES.has(state)?state:'unknown',
        taskRef:/^[a-z0-9_.-]{8,160}$/i.test(clean(row.task_id,160))?clean(row.task_id,160):'',
        pr:Number.isSafeInteger(row.pull_request_number)&&row.pull_request_number>0?row.pull_request_number:null,
        mergeSha:SHA.test(clean(row.merge_sha,40))?clean(row.merge_sha,40):null,
        // This ledger is an operator report, not an independent production receipt.
        productionVerified:false,
      }));
    }
  }
  return map;
}
export function projectSiteAiFleet(registry={},rows=[],{ledgerAvailable=false}={}){
  const sites=(Array.isArray(registry.existingWorkspaceSites)?registry.existingWorkspaceSites:[])
    .filter(eligibleSite).slice(0,100);
  const latest=latestRunRows(rows);
  const entries=sites.map(site=>{
    const url=new URL(site.canonicalUrl);
    const improvement=ledgerAvailable?latest.get(clean(site.id,100))||null:null;
    return Object.freeze({
      siteId:clean(site.id,100),
      name:clean(site.name,120)||clean(site.id,100),
      // URL is a locator; never an authorization/tenant identity.
      detailPath:url.pathname.replace(/\/$/,'')+'/admin/services',
      workspaceIdVerified:false,
      siteAiRegistrationVerified:false,
      siteAiRunningVerified:false,
      siteAiStatus:'unverified',
      improvementLedgerStatus:ledgerAvailable?'available':'unavailable',
      lastImprovement:improvement,
    });
  });
  return Object.freeze({
    contract:'ekodi.site-ai.fleet-readonly.v1',
    integration:'observation_only',
    verifiedLiveAgents:null,
    verifiedLiveAgentsAvailable:false,
    workspaceAuthorizationVerified:false,
    ledgerAvailable:ledgerAvailable===true,
    siteCount:entries.length,
    entries:Object.freeze(entries),
  });
}
export async function readSiteAiFleet(env={},registry={}){
  const db=env?.DB;
  if(!db?.prepare)return projectSiteAiFleet(registry,[],{ledgerAvailable:false});
  try{
    const result=await db.prepare(`SELECT site_id,run_day,state,task_id,pull_request_number,merge_sha
      FROM ekodi_site_improvement_runs ORDER BY run_day DESC LIMIT 100`).all();
    if(!Array.isArray(result?.results))return projectSiteAiFleet(registry,[],{ledgerAvailable:false});
    return projectSiteAiFleet(registry,result.results,{ledgerAvailable:true});
  }catch{
    return projectSiteAiFleet(registry,[],{ledgerAvailable:false});
  }
}
