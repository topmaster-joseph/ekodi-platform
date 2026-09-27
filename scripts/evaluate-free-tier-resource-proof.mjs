import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildFreeTierResourceGovernor } from '../free-tier-resource-governor.js';

export function parseWranglerD1Proof(raw) {
  const batches=Array.isArray(raw)?raw:[raw];
  return batches.flatMap(batch=>Array.isArray(batch?.results)?batch.results:[]);
}

function latestObservedAt(rows){
  let best=null;
  for(const row of rows){
    const ms=Date.parse(String(row?.observed_at||''));
    if(!Number.isFinite(ms)) continue;
    if(best==null||ms>best.ms) best={ms,iso:new Date(ms).toISOString()};
  }
  return best?.iso||null;
}

function assert(condition,message){
  if(!condition) throw new Error(message);
}

export function evaluateMeasuredProof(rows,{now=Date.now(),staleAfterHours=26}={}){
  assert(Array.isArray(rows)&&rows.length>0,'FREE_TIER_SNAPSHOT_ROWS_REQUIRED');
  const governor=buildFreeTierResourceGovernor({snapshots:rows,now,staleAfterHours});
  const cloudflare=governor.providers.cloudflare;
  const supabase=governor.providers.supabase;
  const github=governor.providers.github;

  assert(governor.automaticPaidUpgrade===false,'AUTOMATIC_PAID_UPGRADE_MUST_REMAIN_DISABLED');
  assert(cloudflare,'CLOUDFLARE_GOVERNOR_STATE_REQUIRED');
  assert(supabase,'SUPABASE_GOVERNOR_STATE_REQUIRED');
  assert(github,'GITHUB_GOVERNOR_STATE_REQUIRED');
  assert(cloudflare.telemetryStatus!=='missing','CLOUDFLARE_TELEMETRY_MUST_BE_FRESH');
  assert(supabase.telemetryStatus!=='missing','SUPABASE_TELEMETRY_MUST_BE_FRESH');
  assert(github.telemetryStatus!=='missing','GITHUB_TELEMETRY_MUST_BE_FRESH');

  const active=supabase.metrics.find(item=>item.metric==='active_projects');
  assert(active,'SUPABASE_ACTIVE_PROJECTS_METRIC_REQUIRED');
  assert(active.freeLimit===2,'SUPABASE_FREE_PROJECT_LIMIT_MUST_REMAIN_TWO');
  if((active.observedValue??0)>=active.freeLimit){
    assert(active.state==='capacity_full','SUPABASE_FULL_CAPACITY_STATE_REQUIRED');
    assert(supabase.provisioningAllowed===false,'SUPABASE_NEW_PROJECT_CREATION_MUST_BE_BLOCKED_AT_CAPACITY');
    assert(supabase.capacityBlocks.includes('active_projects'),'SUPABASE_ACTIVE_PROJECT_CAPACITY_BLOCK_REQUIRED');
  }

  const workers=cloudflare.metrics.find(item=>item.metric==='workers_requests_daily'||item.metric==='workers_requests_month');
  assert(workers,'CLOUDFLARE_WORKERS_REQUESTS_METRIC_REQUIRED');
  if(workers.metric==='workers_requests_daily'){
    assert(workers.freeLimit===100000,'CLOUDFLARE_WORKERS_FREE_LIMIT_MUST_REMAIN_100000');
  }else{
    assert(workers.freeLimit===10000000,'CLOUDFLARE_WORKERS_PAID_INCLUDED_REQUESTS_MUST_BE_10000000');
  }

  const cache=github.metrics.find(item=>item.metric==='cache_storage_bytes');
  assert(cache,'GITHUB_CACHE_STORAGE_METRIC_REQUIRED');

  return Object.freeze({
    generatedAt:new Date(now).toISOString(),
    latestObservedAt:latestObservedAt(rows),
    automaticPaidUpgrade:governor.automaticPaidUpgrade,
    cloudflare:Object.freeze({
      state:cloudflare.state,
      action:cloudflare.action,
      telemetryStatus:cloudflare.telemetryStatus,
      workersRequests:Object.freeze({
        metric:workers.metric,
        observedValue:workers.observedValue,
        freeLimit:workers.freeLimit,
        usagePercent:workers.usagePercent,
        state:workers.state,
      }),
      d1Metrics:cloudflare.metrics
        .filter(item=>item.metric.startsWith('d1_rows_read_')||item.metric.startsWith('d1_rows_written_'))
        .map(item=>({metric:item.metric,observedValue:item.observedValue,freeLimit:item.freeLimit,usagePercent:item.usagePercent,state:item.state})),
    }),
    supabase:Object.freeze({
      state:supabase.state,
      action:supabase.action,
      telemetryStatus:supabase.telemetryStatus,
      provisioningAllowed:supabase.provisioningAllowed,
      capacityBlocks:[...supabase.capacityBlocks],
      activeProjects:Object.freeze({
        observedValue:active.observedValue,
        freeLimit:active.freeLimit,
        usagePercent:active.usagePercent,
        state:active.state,
      }),
      databaseMetrics:supabase.metrics
        .filter(item=>item.metric.startsWith('database_bytes:'))
        .map(item=>({metric:item.metric,observedValue:item.observedValue,freeLimit:item.freeLimit,usagePercent:item.usagePercent,state:item.state})),
      storageMetrics:supabase.metrics
        .filter(item=>item.metric.startsWith('storage_bytes_org:')||item.metric.startsWith('storage_object_bytes:'))
        .map(item=>({metric:item.metric,observedValue:item.observedValue,freeLimit:item.freeLimit,usagePercent:item.usagePercent,state:item.state})),
    }),
    github:Object.freeze({
      state:github.state,
      action:github.action,
      telemetryStatus:github.telemetryStatus,
      cacheStorage:cache?{observedValue:cache.observedValue,freeLimit:cache.freeLimit,usagePercent:cache.usagePercent,state:cache.state}:null,
      artifactStorage:github.metrics
        .filter(item=>item.metric==='artifact_storage_bytes')
        .map(item=>({observedValue:item.observedValue,freeLimit:item.freeLimit,usagePercent:item.usagePercent,state:item.state}))[0]||null,
    }),
  });
}

export function formatProofSummary(proof){
  const db=proof.supabase.databaseMetrics.map(item=>`${item.metric}=${item.usagePercent==null?'unknown':item.usagePercent+'%'}`).join(', ')||'none';
  const cache=proof.github.cacheStorage?.usagePercent==null?'unknown':`${proof.github.cacheStorage.usagePercent}%`;
  return [
    '### EKODI Free-Tier Resource Governor proof',
    `- observed_at: ${proof.latestObservedAt||'unknown'}`,
    `- automatic_paid_upgrade: ${proof.automaticPaidUpgrade}`,
    `- cloudflare: state=${proof.cloudflare.state}, telemetry=${proof.cloudflare.telemetryStatus}, ${proof.cloudflare.workersRequests.metric}=${proof.cloudflare.workersRequests.observedValue}/${proof.cloudflare.workersRequests.freeLimit} (${proof.cloudflare.workersRequests.usagePercent}%), d1_metrics=${proof.cloudflare.d1Metrics.length}, action=${proof.cloudflare.action}`,
    `- supabase: state=${proof.supabase.state}, telemetry=${proof.supabase.telemetryStatus}, active_projects=${proof.supabase.activeProjects.observedValue}/${proof.supabase.activeProjects.freeLimit}, provisioning_allowed=${proof.supabase.provisioningAllowed}`,
    `- supabase_db: ${db}`,
    `- github: state=${proof.github.state}, telemetry=${proof.github.telemetryStatus}, cache=${cache}`,
  ].join('\n');
}

async function main(){
  const input=process.argv[2];
  if(!input) throw new Error('FREE_TIER_PROOF_JSON_REQUIRED');
  const raw=JSON.parse(await fs.readFile(input,'utf8'));
  const rows=parseWranglerD1Proof(raw);
  const proof=evaluateMeasuredProof(rows);
  const summary=formatProofSummary(proof);
  process.stdout.write(summary+'\n');
  if(process.env.GITHUB_STEP_SUMMARY){
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n','utf8');
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    console.error('[EKODI-FREE-TIER-GOVERNOR-PROOF]',error?.message||error);
    process.exitCode=1;
  });
}
