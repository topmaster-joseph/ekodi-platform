const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(Number(value))?Number(value):0));
const clean=value=>String(value??'').trim().toLowerCase();
const round=(value,digits=4)=>{const factor=10**digits;return Math.round(value*factor)/factor};

export const AI_ROUTER_SCORE_POLICY=Object.freeze({
  version:'1.1.0',
  historyWindowHours:168,
  recentHealthWindowHours:6,
  maxHistoryRuns:500,
  evidenceRuns:10,
  neutralScore:0.5,
  weights:Object.freeze({
    taskFit:0.33,
    reliability:0.23,
    cost:0.12,
    latency:0.08,
    health:0.10,
    load:0.06,
    quality:0.08,
  }),
});

export function normalizeRouterWeights(value={}){
  const defaults=AI_ROUTER_SCORE_POLICY.weights;
  const source=value&&typeof value==='object'?value:{};
  const raw=Object.fromEntries(Object.keys(defaults).map(key=>{const input=Number(source[key]);const value=Number.isFinite(input)?(input>1?input/100:input):defaults[key];return[key,Math.max(0,Math.min(1,value))]}));
  const total=Object.values(raw).reduce((sum,n)=>sum+n,0);
  if(total<=0)return Object.freeze({...defaults});
  const entries=Object.entries(raw).map(([key,n])=>[key,round(n/total,6)]);
  const sum=entries.reduce((value,[,n])=>value+n,0);
  const target=entries.reduce((best,current)=>current[1]>best[1]?current:best,entries[0]);
  if(target)target[1]=round(target[1]+(1-sum),6);
  return Object.freeze(Object.fromEntries(entries));
}

const COST_SCORES=Object.freeze({
  'free-preferred':1,
  'chatgpt-plan-included':0.9,
  'google-free-quota':0.9,
  'claude-subscription':0.82,
  'account-managed':0.8,
  'provider-managed':0.6,
  'paid-opt-in':0.45,
});

export function providerCostClass(providerId=''){
  const id=clean(providerId);
  if(id==='gemini-free')return'free-preferred';
  if(id==='node:codex')return'chatgpt-plan-included';
  if(id==='node:gemini-cli')return'google-free-quota';
  if(id==='node:claude-code')return'claude-subscription';
  if(id.startsWith('node:'))return'account-managed';
  if(id==='openai-api'||id==='anthropic-api')return'paid-opt-in';
  if(id.startsWith('worker:'))return'provider-managed';
  return'account-managed';
}

export function inferTaskTraits(task={}){
  const text=`${task.title||''} ${task.prompt||''}`.toLowerCase();
  const code=task.needsCodeBranch===true||/\b(code|coding|git|github|branch|deploy|repository|repo|debug|refactor|test|migration)\b/.test(text)||/코드|코딩|깃|브랜치|배포|저장소|디버그|리팩터|테스트|마이그레이션/.test(text);
  const research=!code&&(/\b(research|analyse|analyze|compare|evidence|literature|study)\b/.test(text)||/연구|분석|비교|근거|문헌|조사/.test(text));
  const writing=!code&&!research&&(/\b(write|draft|rewrite|translate|email|document|copy)\b/.test(text)||/작성|초안|번역|이메일|문서|문구|글쓰기/.test(text));
  const category=code?'code':research?'analysis':writing?'writing':'general';
  return Object.freeze({category,code,research,writing,latencyTargetMs:code?120000:30000});
}

function baseProfile(providerId){
  const id=clean(providerId);
  const direct=id==='gemini-free'||id==='openai-api'||id==='anthropic-api';
  const node=id.startsWith('node:');
  const worker=id.startsWith('worker:');
  const skills=node
    ?{general:0.75,analysis:0.8,writing:0.68,code:0.96,review:0.9}
    :direct
      ?{general:0.8,analysis:0.82,writing:0.82,code:0.62,review:0.78}
      :worker
        ?{general:0.8,analysis:0.82,writing:0.8,code:0.8,review:0.82}
        :{general:0.7,analysis:0.7,writing:0.7,code:0.7,review:0.7};
  return{costClass:providerCostClass(id),skills,qualityScore:AI_ROUTER_SCORE_POLICY.neutralScore};
}

function providerProfile(providerId,configured={}){
  const base=baseProfile(providerId);
  const override=configured?.[providerId]||configured?.[clean(providerId)]||{};
  return{
    ...base,
    ...override,
    skills:{...base.skills,...(override.skills||{})},
  };
}

function evidenceBlend(value,total){
  const evidence=Math.min(1,Math.max(0,Number(total)||0)/AI_ROUTER_SCORE_POLICY.evidenceRuns);
  return AI_ROUTER_SCORE_POLICY.neutralScore*(1-evidence)+clamp(value)*evidence;
}

function reliabilityScore(metric){
  const total=Math.max(0,Number(metric?.totalRuns)||0);
  if(!total)return AI_ROUTER_SCORE_POLICY.neutralScore;
  const successful=Math.max(0,Number(metric?.successfulRuns)||0);
  const bayesian=(successful+2)/(total+4);
  return evidenceBlend(bayesian,total);
}

function healthScore(metric){
  const recent=Math.max(0,Number(metric?.recentRuns)||0);
  if(!recent)return AI_ROUTER_SCORE_POLICY.neutralScore;
  const failures=Math.min(recent,Math.max(0,Number(metric?.recentFailures)||0));
  return evidenceBlend(1-failures/recent,recent);
}

function latencyScore(metric,traits){
  const average=Number(metric?.averageLatencyMs);
  if(!Number.isFinite(average)||average<0)return AI_ROUTER_SCORE_POLICY.neutralScore;
  const target=Math.max(1000,traits.latencyTargetMs||30000);
  return clamp(target/(target+average));
}

function loadScore(metric){
  if(metric==null||metric.activeRuns==null)return AI_ROUTER_SCORE_POLICY.neutralScore;
  const active=Math.max(0,Number(metric.activeRuns)||0);
  return clamp(1/(1+active/2));
}

function taskFitScore(profile,traits,role){
  const primary=clamp(profile.skills?.[traits.category]??profile.skills?.general??AI_ROUTER_SCORE_POLICY.neutralScore);
  if(role!=='reviewer')return primary;
  const review=clamp(profile.skills?.review??AI_ROUTER_SCORE_POLICY.neutralScore);
  return round(primary*0.45+review*0.55);
}

export function scoreProvider(providerId,task={},context={}){
  const traits=context.traits||inferTaskTraits(task);
  const profile=providerProfile(providerId,context.providerProfiles||{});
  const metric=context.providerMetrics?.[providerId]||null;
  const dimensions={
    taskFit:taskFitScore(profile,traits,context.role||'primary'),
    reliability:reliabilityScore(metric),
    cost:clamp(COST_SCORES[profile.costClass]??AI_ROUTER_SCORE_POLICY.neutralScore),
    latency:latencyScore(metric,traits),
    health:healthScore(metric),
    load:loadScore(metric),
    quality:clamp(metric?.qualityScore??profile.qualityScore??AI_ROUTER_SCORE_POLICY.neutralScore),
  };
  const weights=normalizeRouterWeights(context.routerPolicy?.weights||AI_ROUTER_SCORE_POLICY.weights);
  const weighted=Object.entries(weights).reduce((sum,[key,weight])=>sum+dimensions[key]*weight,0);
  return Object.freeze({
    providerId,
    score:round(weighted*100,2),
    policyVersion:AI_ROUTER_SCORE_POLICY.version,
    taskCategory:traits.category,
    role:context.role||'primary',
    breakdown:Object.freeze(Object.fromEntries(Object.entries(dimensions).map(([key,value])=>[key,round(value)]))),
    evidence:Object.freeze({
      totalRuns:Math.max(0,Number(metric?.totalRuns)||0),
      recentRuns:Math.max(0,Number(metric?.recentRuns)||0),
      activeRuns:Math.max(0,Number(metric?.activeRuns)||0),
    }),
  });
}

export function rankProviders(providerIds=[],task={},context={}){
  const unique=[...new Set(providerIds.map(id=>String(id||'').trim()).filter(Boolean))];
  const originalIndex=new Map(unique.map((id,index)=>[id,index]));
  return unique
    .map(providerId=>scoreProvider(providerId,task,context))
    .sort((a,b)=>b.score-a.score||(originalIndex.get(a.providerId)-originalIndex.get(b.providerId)));
}
