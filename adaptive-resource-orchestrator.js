const MODE_RANK=Object.freeze({normal:0,save:1,protect:2,survive:3});
const MODES=Object.freeze(['normal','save','protect','survive']);
const USAGE=Object.freeze({save:60,protect:75,survive:90});
const BURN=Object.freeze({minUsage:2,save:0.7,protect:1.0,survive:1.5});
const TRAFFIC_CAPACITY_LIMITS=Object.freeze({L1:100,L2:1000,L3:10000});
const TRAFFIC_CAPACITY_MODE_FLOOR=Object.freeze({L1:'normal',L2:'save',L3:'protect',PROTECT:'survive'});
const TRAFFIC_CAPACITY_ACTION=Object.freeze({
  L1:'shared-normal',
  L2:'absorb-cache-queue',
  L3:'isolate-hot-workloads',
  PROTECT:'protect-critical-paths',
});
const SUSTAINED_WINDOWS=Object.freeze(new Set(['daily','weekly','monthly']));

export const ADAPTIVE_INFRASTRUCTURE_POLICY=Object.freeze({
  policyId:'EKODI-ADAPTIVE-INFRA-001',
  thresholds:Object.freeze({usage:USAGE,burnRate:BURN}),
  automaticPaidUpgrade:false,
  measuredTelemetryOnly:true,
});

function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
function round(value,digits=3){const n=finite(value);if(n==null)return null;const f=10**digits;return Math.round(n*f)/f}
function maxMode(a,b){return MODE_RANK[b]>MODE_RANK[a]?b:a}

export function trafficCapacityTierFromConcurrentSessions(value){
  if(value===null||value===undefined||value==='')return null;
  const sessions=finite(value);
  if(sessions==null||sessions<0)return null;
  if(sessions<=TRAFFIC_CAPACITY_LIMITS.L1)return 'L1';
  if(sessions<=TRAFFIC_CAPACITY_LIMITS.L2)return 'L2';
  if(sessions<=TRAFFIC_CAPACITY_LIMITS.L3)return 'L3';
  return 'PROTECT';
}

function trafficPressureSignals(signals={}){
  const pressure=[];
  const latency=finite(signals.p95LatencyMs);
  const errors=finite(signals.errorRatePercent);
  const spike=finite(signals.trafficSpikeRatio);
  const quotaEvents=finite(signals.provider4291027);
  if(signals.rpsPressure===true)pressure.push('rps_pressure');
  if(signals.queuePressure===true)pressure.push('queue_pressure');
  if(signals.providerQuotaPressure===true||(quotaEvents!=null&&quotaEvents>0))pressure.push('provider_quota_pressure');
  if(signals.d1Pressure===true)pressure.push('d1_query_pressure');
  if(signals.cachePressure===true)pressure.push('cache_miss_pressure');
  if(signals.aiPressure===true)pressure.push('ai_inflight_pressure');
  if(latency!=null&&latency>=1500)pressure.push('p95_latency_pressure');
  if(errors!=null&&errors>=2)pressure.push('error_rate_pressure');
  if(spike!=null&&spike>=2)pressure.push('traffic_spike_pressure');
  return Object.freeze([...new Set(pressure)]);
}

export function classifyTrafficCapacity(signals={}){
  const tier=trafficCapacityTierFromConcurrentSessions(signals.concurrentSessions);
  const concurrentSessions=tier?finite(signals.concurrentSessions):null;
  const requestedWindow=String(signals.sustainedWindow||'').toLowerCase();
  const sustainedWindow=SUSTAINED_WINDOWS.has(requestedWindow)?requestedWindow:'sample';
  const sustained=SUSTAINED_WINDOWS.has(sustainedWindow);
  const pressureSignals=trafficPressureSignals(signals);
  const promotionEligible=Boolean(tier&&tier!=='L1'&&pressureSignals.length>0);
  const capacityModeFloor=promotionEligible?TRAFFIC_CAPACITY_MODE_FLOOR[tier]:'normal';
  return Object.freeze({
    policyId:'EKODI-CONCURRENT-TRAFFIC-10K-001',
    tier,
    observedConcurrentSessions:concurrentSessions==null?null:Math.max(0,Math.round(concurrentSessions)),
    sustainedWindow,
    sustained,
    pressureSignals,
    promotionEligible,
    capacityModeFloor,
    action:tier?TRAFFIC_CAPACITY_ACTION[tier]:'observe',
    dedicatedCapacityCandidate:Boolean(sustained&&(tier==='L3'||tier==='PROTECT')),
    automaticPaidUpgrade:false,
    concurrencyAloneChangesProtectionMode:false,
  });
}

export function adaptiveModeFromUsagePercent(value){
  const percent=finite(value);
  if(percent==null)return 'normal';
  if(percent>=USAGE.survive)return 'survive';
  if(percent>=USAGE.protect)return 'protect';
  if(percent>=USAGE.save)return 'save';
  return 'normal';
}

export function adaptiveModeFromBurnRate(value,{usagePercent=null}={}){
  const rate=finite(value);
  const usage=finite(usagePercent);
  if(rate==null||rate<0)return 'normal';
  if(usage!=null&&usage<BURN.minUsage)return 'normal';
  if(rate>=BURN.survive)return 'survive';
  if(rate>=BURN.protect)return 'protect';
  if(rate>=BURN.save)return 'save';
  return 'normal';
}

function monthWindow(now){
  const date=new Date(now);
  const start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1);
  const end=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1);
  return {start,end};
}
function dayWindow(now){
  const date=new Date(now);
  const start=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
  return {start,end:start+86400000};
}

export function metricPeriodProgress({metric='',now=Date.now()}={}){
  const id=String(metric||'').toLowerCase();
  const window=id.includes('_month')||id.includes('monthly')?monthWindow(now):id.includes('_daily')||id.includes('daily')?dayWindow(now):null;
  if(!window)return null;
  const progress=(now-window.start)/(window.end-window.start);
  return Math.max(0.001,Math.min(1,progress));
}

export function metricBurnRate(metric,{now=Date.now()}={}){
  const percent=finite(metric?.usagePercent);
  if(percent==null||percent<0)return null;
  const progress=metricPeriodProgress({metric:metric?.metric,now});
  if(progress==null)return null;
  return round((percent/100)/progress,3);
}

function runtimeSignalMode(signals={}){
  let mode='normal';
  const latency=finite(signals.p95LatencyMs);
  const errors=finite(signals.errorRatePercent);
  const spike=finite(signals.trafficSpikeRatio);
  if((latency!=null&&latency>=5000)||(errors!=null&&errors>=10)||(spike!=null&&spike>=8))return 'survive';
  if((latency!=null&&latency>=3000)||(errors!=null&&errors>=5)||(spike!=null&&spike>=4))mode=maxMode(mode,'protect');
  else if((latency!=null&&latency>=1500)||(errors!=null&&errors>=2)||(spike!=null&&spike>=2))mode=maxMode(mode,'save');
  return mode;
}

const ACTIONS=Object.freeze({
  normal:Object.freeze({cacheProfile:'balanced',readPath:'cache-then-source',backgroundMode:'normal',auxiliaryMode:'preferred-for-noncritical'}),
  save:Object.freeze({cacheProfile:'aggressive-safe',readPath:'cdn-r2-snapshot-first',backgroundMode:'batch-and-coalesce',auxiliaryMode:'prefer-for-noncritical'}),
  protect:Object.freeze({cacheProfile:'maximum-safe',readPath:'snapshot-first-source-critical-only',backgroundMode:'defer-low-priority',auxiliaryMode:'noncritical-only'}),
  survive:Object.freeze({cacheProfile:'last-known-good-safe',readPath:'critical-live-safe-read-snapshots',backgroundMode:'pause-nonessential',auxiliaryMode:'noncritical-only'}),
});
const SERVICE_ACTIONS=Object.freeze({
  normal:Object.freeze({S0:'live-direct',S1:'live-cache',S2:'cache-preferred',S3:'normal-background'}),
  save:Object.freeze({S0:'live-direct',S1:'cache-preferred-writes-live',S2:'snapshot-first',S3:'batch-auxiliary'}),
  protect:Object.freeze({S0:'live-direct',S1:'live-aggressive-cache',S2:'snapshot-safe-read-defer-recompute',S3:'paused'}),
  survive:Object.freeze({S0:'live-direct-fail-closed',S1:'essential-only',S2:'last-known-good-read-only',S3:'paused'}),
});

export function classifyServiceCriticality(value=''){
  const id=String(value||'').toLowerCase();
  if(/auth|identity|permission|authorization|security|secret|payment|finance|bank|transfer|order|inventory/.test(id))return 'S0';
  if(/crawler|preview|experiment|development|staging|synthetic|batch|noncritical-ai/.test(id))return 'S3';
  if(/analytics|report|statistic|search|catalog|marketing|public-content/.test(id))return 'S2';
  return 'S1';
}

export function serviceActionForMode(service,mode='normal'){
  const criticality=/^S[0-3]$/.test(String(service||''))?String(service):classifyServiceCriticality(service);
  const normalized=MODES.includes(mode)?mode:'normal';
  return Object.freeze({
    criticality,
    mode:normalized,
    action:SERVICE_ACTIONS[normalized][criticality],
    staleFallbackAllowed:criticality==='S0'?false:criticality==='S1'?'safe-read-only-only':true,
    auxiliaryProductionExecutionAllowed:criticality==='S0'||criticality==='S1'?false:'noncritical-compute-only',
  });
}

export function buildAdaptiveInfrastructureDecision({metrics=[],runtimeSignals={},now=Date.now()}={}){
  const measured=(metrics||[]).filter(item=>item?.measured!==false&&item?.stale!==true&&item?.scope!=='capacity'&&finite(item?.usagePercent)!=null);
  let usageMode='normal';
  let burnMode='normal';
  let highestUsagePercent=null;
  let highestBurnRate=null;
  let pressureMetric=null;
  for(const metric of measured){
    const usage=finite(metric.usagePercent);
    const burn=metricBurnRate(metric,{now});
    if(highestUsagePercent==null||usage>highestUsagePercent)highestUsagePercent=usage;
    if(burn!=null&&(highestBurnRate==null||burn>highestBurnRate)){highestBurnRate=burn;pressureMetric=String(metric.metric||'');}
    usageMode=maxMode(usageMode,adaptiveModeFromUsagePercent(usage));
    burnMode=maxMode(burnMode,adaptiveModeFromBurnRate(burn,{usagePercent:usage}));
  }
  const healthMode=runtimeSignalMode(runtimeSignals);
  const trafficCapacity=classifyTrafficCapacity(runtimeSignals);
  const trafficCapacityMode=trafficCapacity.promotionEligible?trafficCapacity.capacityModeFloor:'normal';
  const mode=[usageMode,burnMode,healthMode,trafficCapacityMode].reduce(maxMode,'normal');
  const profile=ACTIONS[mode];
  return Object.freeze({
    schemaVersion:1,
    policyId:'EKODI-ADAPTIVE-INFRA-001',
    mode,
    reasons:Object.freeze({usageMode,burnRateMode:burnMode,runtimeMode:healthMode,trafficCapacityMode}),
    highestUsagePercent:highestUsagePercent==null?null:round(highestUsagePercent,2),
    highestBurnRate:highestBurnRate==null?null:round(highestBurnRate,3),
    pressureMetric,
    telemetryStatus:measured.length?'measured':'missing',
    cacheProfile:profile.cacheProfile,
    readPath:profile.readPath,
    backgroundMode:profile.backgroundMode,
    auxiliaryMode:profile.auxiliaryMode,
    blockNonessential:mode==='protect'||mode==='survive',
    preserveCriticalLive:true,
    automaticPaidUpgrade:false,
    trafficCapacity,
    serviceActions:Object.freeze({
      S0:serviceActionForMode('S0',mode),
      S1:serviceActionForMode('S1',mode),
      S2:serviceActionForMode('S2',mode),
      S3:serviceActionForMode('S3',mode),
    }),
  });
}
