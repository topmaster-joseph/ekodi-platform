import executionCatalog from './config/ai-execution-services.json' with { type: 'json' };

const LIMITS=Object.freeze({job:1200,problem:2000,outcome:1600,audience:600,currentWay:1200,request:1200});
const normalize=value=>String(value??'').trim().toLocaleLowerCase('ko-KR');
const compact=value=>String(value??'').replace(/\s+/g,' ').trim();
const tokenize=value=>[...new Set(normalize(value).split(/[^\p{L}\p{N}]+/u).filter(token=>token.length>=2))];

export const AI_COMMONS_POLICY=Object.freeze({
  version:'1.1.0',surface:'/ai',audience:'all-ekodi-users',freeMemberPrinciple:'complete-first-value',
  uxPrinciple:executionCatalog.principle,
  differentiation:'scale-speed-automation-advanced-capability',reuseFirst:true,directProductionPromotion:false,
  autoDevelopment:true,finalPublishAuthority:'super_admin',
  lifecycle:Object.freeze(['submitted','reuse_suggested','triaged','candidate','sandboxed','verified','staged','shared','rejected']),
});

function capabilityText(capability={}){
  return [capability.id,capability.name,capability.domain,capability.description,...(capability.tags||[])].map(normalize).join(' ');
}

export function scoreCommonCapability(query,capability={}){
  const text=normalize(query);if(!text)return 0;const haystack=capabilityText(capability);const tokens=tokenize(text);let score=0;
  if(haystack.includes(text))score+=40;
  for(const token of tokens){if(normalize(capability.name).includes(token))score+=12;if((capability.tags||[]).some(tag=>normalize(tag).includes(token)))score+=8;if(haystack.includes(token))score+=3;}
  if(capability.maturity==='service-backed')score+=2;return score;
}function canonicalLaunchUrl(capability={}){
  const provider=String(capability.provider?.surface||'').trim();if(provider)return provider;
  const service=String(capability.showroom?.serviceId||'').trim();if(service)return `https://ekodi.kr/${encodeURIComponent(service)}/`;
  return 'https://ekodi.kr/my/#intent';
}

export function commonCapabilityView(capability={}){
  return Object.freeze({id:String(capability.id||''),name:String(capability.name||''),domain:String(capability.domain||'general'),
    description:String(capability.description||''),maturity:String(capability.maturity||'contract'),actionTier:String(capability.actionTier||'assist'),
    tags:Object.freeze([...(capability.tags||[]).map(String)]),launchUrl:canonicalLaunchUrl(capability),
    usableNow:capability.maturity==='service-backed'||capability.maturity==='service-backed-readonly'||Boolean(capability.provider?.surface)});
}

export function listCommonCapabilities(registry={},options={}){
  const capabilities=Array.isArray(registry.capabilities)?registry.capabilities:[];const includeContract=options.includeContract!==false;
  return capabilities.filter(item=>item&&item.actionTier!=='forbidden'&&(includeContract||String(item.maturity).startsWith('service-backed')))
    .map(commonCapabilityView).sort((a,b)=>Number(b.usableNow)-Number(a.usableNow)||a.name.localeCompare(b.name,'ko'));
}

export function rankCommonCapabilities(query,registry={},limit=5){
  const max=Math.max(1,Math.min(10,Number(limit)||5));
  return listCommonCapabilities(registry).map(item=>({...item,score:scoreCommonCapability(query,item)})).filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score||Number(b.usableNow)-Number(a.usableNow)||a.id.localeCompare(b.id)).slice(0,max);
}
function serviceSearchText(service={},capability={}){
  return normalize([service.label,service.category,capability.name,capability.description,...(capability.tags||[])].join(' '));
}
export function listExecutionServices(registry={}){
  const capabilities=new Map((registry.capabilities||[]).map(item=>[item.id,item]));
  const categories=(executionCatalog.categories||[]).map(item=>({...item,services:[]}));const categoryMap=new Map(categories.map(item=>[item.id,item]));
  for(const service of executionCatalog.services||[]){const capability=capabilities.get(service.capabilityId);if(!capability)continue;
    const usable=String(capability.maturity||'').startsWith('service-backed')||Boolean(capability.provider?.surface);
    if(!usable)continue;const view=Object.freeze({...service,description:String(capability.description||''),usableNow:true});categoryMap.get(service.category)?.services.push(view);}
  return Object.freeze(categories.filter(item=>item.services.length).map(item=>Object.freeze({...item,services:Object.freeze(item.services)})));
}
export function rankExecutionServices(query,registry={},limit=5){
  const tokens=tokenize(query);const capabilities=new Map((registry.capabilities||[]).map(item=>[item.id,item]));const services=[];
  for(const category of listExecutionServices(registry))for(const service of category.services){const capability=capabilities.get(service.capabilityId)||{};const haystack=serviceSearchText(service,capability);let score=0;
    for(const token of tokens){if(normalize(service.label).includes(token))score+=15;if(haystack.includes(token))score+=4;}if(score>0)services.push({...service,categoryLabel:category.label,score});}
  return services.sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label,'ko')).slice(0,Math.max(1,Math.min(10,Number(limit)||5)));
}
export function publicExecutionServiceView(service={}){
  return Object.freeze({id:String(service.id||''),category:String(service.category||''),label:String(service.label||''),launchUrl:String(service.launchUrl||''),
    description:String(service.description||''),usableNow:Boolean(service.usableNow),...(service.categoryLabel?{categoryLabel:String(service.categoryLabel)}:{})});
}
export function rankPublicExecutionServices(query,registry={},limit=5){
  return Object.freeze(rankExecutionServices(query,registry,limit).map(publicExecutionServiceView));
}
function bounded(value,key,required=false){const text=compact(value);const max=LIMITS[key];if(required&&!text)throw new Error(`${key}_required`);if(text.length>max)throw new Error(`${key}_too_long`);return text;}

export function normalizeAiIdeaInput(input={}){
  const quick=bounded(input.request,'request');const problem=bounded(input.problem||quick,'problem',true);const outcome=bounded(input.outcome||quick,'outcome',true);
  const audience=bounded(input.audience||'에코디 사용자','audience',true);const currentWay=bounded(input.currentWay,'currentWay');const job=bounded(input.job||quick||`${problem} ${outcome}`,'job');
  const sourceServiceId=String(input.sourceServiceId||input.source_service_id||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,80);
  return Object.freeze({problem,outcome,audience,currentWay,job,sourceServiceId});
}
export function suggestedIdeaState(matches=[]){const best=Array.isArray(matches)?matches[0]:null;return best&&Number(best.score)>=14?'reuse_suggested':'submitted';}
export function userIdeaStatus(status){
  return ({
    submitted:'요청접수',
    reuse_suggested:'검토중',
    triaged:'검토중',
    candidate:'개발중',
    sandboxed:'테스트중',
    verified:'검증완료',
    staged:'공개준비중',
    shared:'사용가능',
    rejected:'거절',
  })[String(status||'submitted')]||'검토중';
}
function ideaDisplayBase(row={}){
  const requestCount=Math.max(1,Number(row.request_count||row.requestCount)||1);const status=String(row.status||'submitted');
  return {id:String(row.id||''),title:String(row.outcome||row.title||''),status,userStatus:userIdeaStatus(status),requestCount,
    recommended:Boolean(row.recommended)||requestCount>=3,createdAt:row.created_at||row.createdAt||null,updatedAt:row.updated_at||row.updatedAt||null};
}
export function publicRequestView(row={}){
  const view=ideaDisplayBase(row);return Object.freeze({title:view.title,status:view.status,userStatus:view.userStatus,requestCount:view.requestCount,
    recommended:view.recommended,createdAt:view.createdAt,updatedAt:view.updatedAt});
}
export function memberIdeaView(row={}){
  return Object.freeze({...ideaDisplayBase(row),problem:String(row.problem||''),outcome:String(row.outcome||''),audience:String(row.audience||''),
    currentWay:String(row.current_way||row.currentWay||''),sourceServiceId:String(row.source_service_id||row.sourceServiceId||'')});
}
export function adminIdeaView(row={}){
  return Object.freeze({...memberIdeaView(row),fingerprint:String(row.fingerprint||''),matchedCapabilityId:row.matched_capability_id||row.matchedCapabilityId||null,
    sourceServices:String(row.source_services||row.sourceServices||'').split(',').map(v=>v.trim()).filter(Boolean),
    developmentTaskId:row.development_task_id||row.developmentTaskId||null,reviewDecision:row.review_decision||row.reviewDecision||null});
}
export function canPromoteIdeaStatus(from,to){
  const allowed=new Map([['submitted',new Set(['reuse_suggested','triaged','rejected'])],['reuse_suggested',new Set(['triaged','shared','rejected'])],
    ['triaged',new Set(['candidate','shared','rejected'])],['candidate',new Set(['sandboxed','rejected'])],['sandboxed',new Set(['verified','rejected'])],
    ['verified',new Set(['staged','rejected'])],['staged',new Set(['shared','rejected'])]]);return allowed.get(String(from||''))?.has(String(to||''))===true;
}
export function canFinalPublish(status){return status==='staged';}
export function executionCatalogSnapshot(registry={}){
  const categories=listExecutionServices(registry).map(category=>Object.freeze({id:String(category.id||''),label:String(category.label||''),order:Number(category.order)||0,
    services:Object.freeze((category.services||[]).map(publicExecutionServiceView))}));
  return Object.freeze({version:executionCatalog.version,principle:executionCatalog.principle,categories:Object.freeze(categories)});
}
const REQUEST_STOP_WORDS=new Set(['해줘','해주세요','만들어줘','만들기','서비스','에코디','사용자','자동','자동으로','기능','필요','원해요']);
function requestToken(value){
  return normalize(value).replace(/(으로|에서|에게|까지|부터|처럼|하고|해서|하며|하는|은|는|이|가|을|를|의|에|도|만)$/u,'');
}
export function normalizedRequestTokens(value=''){
  return Object.freeze(tokenize(value).map(requestToken).filter(token=>token.length>=2&&!REQUEST_STOP_WORDS.has(token)).sort());
}
export function requestSimilarity(left='',right=''){
  const a=new Set(normalizedRequestTokens(left));const b=new Set(normalizedRequestTokens(right));
  if(!a.size||!b.size)return 0;let overlap=0;for(const token of a)if(b.has(token))overlap++;
  const coefficient=overlap/Math.min(a.size,b.size);const union=new Set([...a,...b]).size;const jaccard=union?overlap/union:0;
  return Number((coefficient*.7+jaccard*.3).toFixed(4));
}
