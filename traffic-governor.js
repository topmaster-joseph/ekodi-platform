const POLICY='EKODI-CONCURRENT-TRAFFIC-10K-001';
const TRAFFIC_BINDINGS=Object.freeze({
  l2:'TRAFFIC_L2_RATE_LIMITER',
  l3:'TRAFFIC_L3_RATE_LIMITER',
  protect:'TRAFFIC_PROTECT_RATE_LIMITER'
});
const CACHE_PROFILE=Object.freeze({
  L1:{ttl:60,swr:300},
  L2:{ttl:120,swr:600},
  L3:{ttl:300,swr:1800},
  PROTECT:{ttl:600,swr:3600}
});
const RUNTIME_PRESSURE=Object.freeze({
  windowMs:60_000,
  minimumSamples:10,
  maxSamples:180,
  holdMs:10*60_000,
  p95Ms:{L2:1200,L3:2200,PROTECT:4000},
  errorPercent:{L2:2,L3:5,PROTECT:12}
});
const PRIVATE_PREFIXES=['/auth','/my','/admin','/control','/api','/mcp','/webhooks','/mail','/live'];
const NONCRITICAL_PREFIXES=['/preview','/api/analytics','/api/telemetry','/api/ai/background'];
const CORE_PROBES=new Set(['/health','/__ekodi/version','/sitemap.xml','/robots.txt','/llms.txt']);
const TIER_RANK=Object.freeze({L1:0,L2:1,L3:2,PROTECT:3});
const TIER_BY_RANK=['L1','L2','L3','PROTECT'];

let runtimeSamples=[];
let heldTier='L1';
let heldUntil=0;

async function limiterAllowed(binding,key){
  if(!binding?.limit)return null;
  try{
    const result=await binding.limit({key});
    return result?.success!==false;
  }catch(error){
    console.error('EKODI traffic limiter unavailable',error);
    return null;
  }
}
function highestTier(...tiers){
  return tiers.reduce((best,tier)=>(TIER_RANK[tier]??0)>(TIER_RANK[best]??0)?tier:best,'L1');
}
function pruneSamples(now){
  const cutoff=now-RUNTIME_PRESSURE.windowMs;
  runtimeSamples=runtimeSamples.filter(sample=>sample.at>=cutoff).slice(-RUNTIME_PRESSURE.maxSamples);
}
function percentile95(values){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*0.95)-1)]||0;
}
export function trafficRuntimeSnapshot(now=Date.now()){
  pruneSamples(now);
  const count=runtimeSamples.length;
  const p95Ms=Math.round(percentile95(runtimeSamples.map(sample=>sample.durationMs)));
  const errors=runtimeSamples.filter(sample=>sample.error).length;
  const errorPercent=count?Number(((errors/count)*100).toFixed(2)):0;
  let tier='L1';
  if(count>=RUNTIME_PRESSURE.minimumSamples){
    if(p95Ms>=RUNTIME_PRESSURE.p95Ms.PROTECT||errorPercent>=RUNTIME_PRESSURE.errorPercent.PROTECT)tier='PROTECT';
    else if(p95Ms>=RUNTIME_PRESSURE.p95Ms.L3||errorPercent>=RUNTIME_PRESSURE.errorPercent.L3)tier='L3';
    else if(p95Ms>=RUNTIME_PRESSURE.p95Ms.L2||errorPercent>=RUNTIME_PRESSURE.errorPercent.L2)tier='L2';
  }
  return {tier,count,p95Ms,errorPercent};
}
export function recordTrafficOutcome({durationMs=0,status=200,now=Date.now()}={}){
  const duration=Math.max(0,Math.min(120_000,Number(durationMs)||0));
  const code=Number(status)||0;
  runtimeSamples.push({at:now,durationMs:duration,error:code>=500||code===429});
  pruneSamples(now);
}
function hysteresisTier(target,now){
  const targetRank=TIER_RANK[target]??0;
  const heldRank=TIER_RANK[heldTier]??0;
  if(targetRank>heldRank){
    heldTier=target;
    heldUntil=now+RUNTIME_PRESSURE.holdMs;
    return heldTier;
  }
  if(targetRank===heldRank){
    if(targetRank>0)heldUntil=Math.max(heldUntil,now+RUNTIME_PRESSURE.holdMs);
    return heldTier;
  }
  if(now<heldUntil)return heldTier;
  heldTier=TIER_BY_RANK[Math.max(targetRank,heldRank-1)]||'L1';
  heldUntil=heldTier==='L1'?0:now+RUNTIME_PRESSURE.holdMs;
  return heldTier;
}
export function resetTrafficGovernorForTests(){
  runtimeSamples=[];
  heldTier='L1';
  heldUntil=0;
}

export async function assessTrafficTier(request,env={}){
  const now=Date.now();
  const key='shared-site:worker-pressure';
  const [l2,l3,protect]=await Promise.all([
    limiterAllowed(env[TRAFFIC_BINDINGS.l2],key),
    limiterAllowed(env[TRAFFIC_BINDINGS.l3],key),
    limiterAllowed(env[TRAFFIC_BINDINGS.protect],key)
  ]);
  const degraded=l2===null||l3===null||protect===null;
  const limiterTier=degraded?'L1':protect===false?'PROTECT':l3===false?'L3':l2===false?'L2':'L1';
  const observed=trafficRuntimeSnapshot(now);
  const target=highestTier(limiterTier,observed.tier);
  const tier=hysteresisTier(target,now);
  const reasons=[];
  if(limiterTier!=='L1')reasons.push('rps');
  if(observed.tier!=='L1')reasons.push('latency_or_error');
  if(tier!==target)reasons.push('recovery_hysteresis');
  if(degraded)reasons.push('limiter_degraded');
  return {tier,degraded,policy:POLICY,reasons,observed,limiterTier};
}

function isCrawler(request){
  if(request.headers.get('authorization'))return false;
  const ua=String(request.headers.get('user-agent')||'').toLowerCase();
  return /bot\b|crawler|spider|scrapy|headlesschrome|python-requests|wget\//.test(ua);
}
function noncriticalPath(pathname){
  const path=String(pathname||'').toLowerCase();
  return NONCRITICAL_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix+'/'));
}
function retryResponse(status,code,tier,retryAfter){
  return new Response(JSON.stringify({ok:false,error:code,tier}),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'retry-after':String(retryAfter),
      'x-content-type-options':'nosniff',
      'x-ekodi-traffic-tier':tier,
      'x-ekodi-traffic-policy':POLICY
    }
  });
}

export function trafficRequestGuard(request,assessment){
  const tier=assessment?.tier||'L1';
  const method=String(request.method||'GET').toUpperCase();
  const path=new URL(request.url).pathname;
  if(CORE_PROBES.has(path))return null;
  if(tier==='PROTECT'&&noncriticalPath(path))return retryResponse(503,'TRAFFIC_PROTECT_NONCRITICAL_SHED',tier,30);
  if(['GET','HEAD'].includes(method)&&(tier==='L3'||tier==='PROTECT')&&isCrawler(request))return retryResponse(429,'TRAFFIC_CRAWLER_SHED',tier,60);
  return null;
}

function privatePath(pathname){
  const path=String(pathname||'').toLowerCase();
  return PRIVATE_PREFIXES.some(prefix=>path===prefix||path.startsWith(prefix+'/'));
}
function responseCacheForbidden(response){
  const cache=String(response.headers.get('cache-control')||'').toLowerCase();
  return /(?:^|,)\s*(?:no-store|private|no-cache|must-revalidate|proxy-revalidate)\b/.test(cache)
    || response.headers.has('set-cookie');
}
function cacheableContent(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  return type.includes('text/html')||type.includes('application/json')||type.includes('application/xml')||type.includes('text/xml')||type.startsWith('text/plain');
}
export function isTrafficCacheEligible(request,response){
  if(!['GET','HEAD'].includes(String(request.method||'GET').toUpperCase()))return false;
  if(response.status!==200||request.headers.has('authorization')||request.headers.has('cookie'))return false;
  const url=new URL(request.url);
  if(url.search||privatePath(url.pathname)||responseCacheForbidden(response)||!cacheableContent(response))return false;
  return true;
}

export function applyTrafficResponsePolicy(response,request,assessment={}){
  const tier=assessment?.tier||'L1';
  const out=new Response(response.body,response);
  out.headers.set('x-ekodi-traffic-tier',tier);
  out.headers.set('x-ekodi-traffic-policy',POLICY);
  if(assessment?.reasons?.length)out.headers.set('x-ekodi-traffic-reason',assessment.reasons.join(','));
  if(assessment?.degraded)out.headers.set('x-ekodi-traffic-observer','degraded');
  const url=new URL(request.url);
  const privateContext=privatePath(url.pathname)||request.headers.has('authorization')||request.headers.has('cookie');
  if(privateContext&&cacheableContent(out)){
    out.headers.set('cache-control','no-store');
    out.headers.delete('cloudflare-cdn-cache-control');
    return out;
  }
  if(!isTrafficCacheEligible(request,out))return out;
  const profile=CACHE_PROFILE[tier]||CACHE_PROFILE.L1;
  if(!out.headers.has('cache-control'))out.headers.set('cache-control','public, max-age=0');
  out.headers.set('cloudflare-cdn-cache-control',`public, max-age=${profile.ttl}, stale-while-revalidate=${profile.swr}, stale-if-error=86400`);
  out.headers.set('x-ekodi-edge-cache','public-anonymous');
  return out;
}

export const EKODI_TRAFFIC_GOVERNOR=Object.freeze({
  policy:POLICY,
  bindings:TRAFFIC_BINDINGS,
  cache:CACHE_PROFILE,
  runtime:RUNTIME_PRESSURE,
  preserve:['public_read','auth','forms','orders','payments','admin_control'],
  shedFirst:['crawler','analytics_detail','background_ai','noncritical_probes']
});
