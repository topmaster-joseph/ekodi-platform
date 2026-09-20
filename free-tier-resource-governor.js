import { evaluateFreeTierQuota, freeTierState } from './free-tier-quota-guard.js';

const MB=1024*1024;
const GB=1024*1024*1024;
const STATE_RANK=Object.freeze({normal:0,warning:1,conserve:2,protect:3,survival:4,circuit_breaker:5});

export const FREE_TIER_RESOURCE_CATALOG=Object.freeze({
  cloudflare:Object.freeze({
    referenceDate:'2026-09-20',
    metrics:Object.freeze([
      {metric:'workers_requests_daily',label:'Workers requests / day',freeLimit:100000,unit:'requests',scope:'consumption'},
      {metric:'d1_rows_read_daily',label:'D1 rows read / day',freeLimit:5000000,unit:'rows',scope:'consumption'},
      {metric:'d1_rows_written_daily',label:'D1 rows written / day',freeLimit:100000,unit:'rows',scope:'consumption'},
      {metric:'d1_storage_bytes',label:'D1 total storage',freeLimit:5*GB,unit:'bytes',scope:'consumption'},
      {metric:'kv_reads_daily',label:'KV reads / day',freeLimit:100000,unit:'operations',scope:'consumption'},
      {metric:'kv_writes_daily',label:'KV writes / day',freeLimit:1000,unit:'operations',scope:'consumption'},
      {metric:'kv_storage_bytes',label:'KV storage',freeLimit:GB,unit:'bytes',scope:'consumption'},
      {metric:'r2_storage_bytes_month',label:'R2 storage / month',freeLimit:10*GB,unit:'byte-month',scope:'consumption'},
      {metric:'r2_class_a_month',label:'R2 Class A / month',freeLimit:1000000,unit:'operations',scope:'consumption'},
      {metric:'r2_class_b_month',label:'R2 Class B / month',freeLimit:10000000,unit:'operations',scope:'consumption'},
    ]),
  }),
  supabase:Object.freeze({
    referenceDate:'2026-09-20',
    metrics:Object.freeze([
      {metric:'active_projects',label:'Active projects',freeLimit:2,unit:'projects',scope:'capacity',fullAction:'block_new_resource'},
      {metricPrefix:'database_bytes:',label:'Database size / project',freeLimit:500*MB,unit:'bytes',scope:'consumption'},
      {metric:'egress_bytes_month',label:'Unified egress / month',freeLimit:5*GB,unit:'bytes',scope:'consumption'},
      {metric:'storage_bytes_org',label:'Storage size',freeLimit:GB,unit:'bytes',scope:'consumption'},
      {metric:'mau_month',label:'Monthly active users',freeLimit:50000,unit:'users',scope:'consumption'},
      {metric:'edge_function_invocations_month',label:'Edge Function invocations / month',freeLimit:500000,unit:'invocations',scope:'consumption'},
      {metric:'realtime_messages_month',label:'Realtime messages / month',freeLimit:2000000,unit:'messages',scope:'consumption'},
      {metric:'realtime_peak_connections',label:'Realtime peak connections',freeLimit:200,unit:'connections',scope:'consumption'},
    ]),
  }),
  github:Object.freeze({
    referenceDate:'2026-09-20',
    facts:Object.freeze({publicRepositoryStandardHostedRunners:'free',artifactStorage:'plan-dependent'}),
    metrics:Object.freeze([
      {metric:'artifact_storage_bytes',label:'Actions artifact storage',freeLimit:null,unit:'bytes',scope:'consumption',planDependent:true},
      {metric:'cache_storage_bytes',label:'Actions cache storage',freeLimit:10*GB,unit:'bytes',scope:'consumption'},
    ]),
  }),
});

function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function isoMs(value){const ms=Date.parse(String(value||''));return Number.isFinite(ms)?ms:null}
function metricDefinition(provider,metric){
  const catalog=FREE_TIER_RESOURCE_CATALOG[provider];
  if(!catalog)return null;
  return catalog.metrics.find(item=>item.metric===metric||(item.metricPrefix&&String(metric).startsWith(item.metricPrefix)))||null;
}
function latestSnapshots(rows){
  const latest=new Map();
  for(const row of rows||[]){
    const provider=String(row?.provider||'').trim().toLowerCase();
    const metric=String(row?.metric||'').trim();
    if(!provider||!metric)continue;
    const key=`${provider}:${metric}`;
    const existing=latest.get(key);
    const currentMs=isoMs(row.observed_at)??0;
    const existingMs=isoMs(existing?.observed_at)??-1;
    if(!existing||currentMs>=existingMs)latest.set(key,row);
  }
  return [...latest.values()];
}

export function evaluateResourceMetric(row,{now=Date.now(),staleAfterHours=26}={}){
  const provider=String(row?.provider||'').trim().toLowerCase();
  const metric=String(row?.metric||'').trim();
  const definition=metricDefinition(provider,metric);
  const observed=finite(row?.observed_value);
  const rowLimit=finite(row?.free_limit);
  const freeLimit=rowLimit!=null&&rowLimit>0?rowLimit:finite(definition?.freeLimit);
  const measured=observed!=null;
  const percent=measured&&freeLimit!=null&&freeLimit>0?Math.max(0,(observed/freeLimit)*100):null;
  const observedAt=String(row?.observed_at||'');
  const observedMs=isoMs(observedAt);
  const stale=observedMs==null?true:(now-observedMs)>(staleAfterHours*60*60*1000);
  const scope=definition?.scope||'consumption';
  const capacityFull=scope==='capacity'&&percent!=null&&percent>=100;
  return Object.freeze({
    provider,metric,label:definition?.label||metric,scope,
    observedValue:observed,freeLimit,unit:definition?.unit||null,
    usagePercent:percent==null?null:Math.round(percent*100)/100,
    state:percent==null?'unknown':capacityFull?'capacity_full':freeTierState(percent),
    action:capacityFull?(definition?.fullAction||'block_new_resource'):percent==null?'telemetry_missing':evaluateFreeTierQuota({percent}).action,
    measured,stale,source:String(row?.source||''),observedAt,
  });
}

export function buildFreeTierResourceGovernor({snapshots=[],states=[],now=Date.now(),staleAfterHours=26}={}){
  const evaluated=latestSnapshots(snapshots).map(row=>evaluateResourceMetric(row,{now,staleAfterHours}));
  const stateByProvider=new Map((states||[]).map(row=>[String(row?.provider||'').toLowerCase(),row]));
  const providers={};
  const ids=new Set([...Object.keys(FREE_TIER_RESOURCE_CATALOG),...evaluated.map(item=>item.provider),...stateByProvider.keys()]);
  for(const provider of ids){
    const metrics=evaluated.filter(item=>item.provider===provider);
    const fresh=metrics.filter(item=>item.measured&&!item.stale);
    const runtime=fresh.filter(item=>item.scope!=='capacity'&&item.usagePercent!=null);
    const capacities=fresh.filter(item=>item.scope==='capacity');
    const highest=runtime.reduce((max,item)=>Math.max(max,item.usagePercent||0),0);
    const persisted=stateByProvider.get(provider)||{};
    const circuitOpen=Number(persisted.circuit_open||0)===1;
    const computedState=runtime.reduce((state,item)=>{
      const candidate=item.state in STATE_RANK?item.state:'normal';
      return STATE_RANK[candidate]>STATE_RANK[state]?candidate:state;
    },'normal');
    const persistedState=String(persisted.state||'normal');
    const state=circuitOpen?'circuit_breaker':(persistedState in STATE_RANK&&STATE_RANK[persistedState]>STATE_RANK[computedState]?persistedState:computedState);
    const runtimePolicy=evaluateFreeTierQuota({percent:highest,errorCode:persisted.last_error_code||'',essential:false});
    const capacityBlocks=capacities.filter(item=>item.state==='capacity_full').map(item=>item.metric);
    const catalog=FREE_TIER_RESOURCE_CATALOG[provider]||{metrics:[]};
    const knownMetrics=new Set(metrics.map(item=>item.metric));
    const missing=(catalog.metrics||[]).filter(def=>def.metric&&!knownMetrics.has(def.metric)).map(def=>def.metric);
    providers[provider]=Object.freeze({
      state,
      action:circuitOpen?'circuit_breaker':runtimePolicy.action,
      highestUsagePercent:runtime.length?Math.round(highest*100)/100:null,
      telemetryStatus:fresh.length===0?'missing':missing.length?'partial':'measured',
      provisioningAllowed:capacityBlocks.length===0,
      capacityBlocks,
      automaticPaidUpgrade:false,
      metrics,
      catalog,
      persistedState:persisted.observed_at?{
        state:persistedState,circuitOpen,source:String(persisted.source||''),observedAt:String(persisted.observed_at||'')
      }:null,
    });
  }
  return Object.freeze({
    schemaVersion:2,
    generatedAt:new Date(now).toISOString(),
    measuredTelemetryOnly:true,
    staleAfterHours,
    automaticPaidUpgrade:false,
    providers:Object.freeze(providers),
  });
}
