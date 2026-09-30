const PROVIDERS=Object.freeze([
  ['baemin','배달의민족','STORE_DISCOVERY_BAEMIN_URL'],
  ['coupang_eats','쿠팡이츠','STORE_DISCOVERY_COUPANG_EATS_URL'],
  ['yogiyo','요기요','STORE_DISCOVERY_YOGIYO_URL'],
  ['ddangyo','땡겨요','STORE_DISCOVERY_DDANGYO_URL'],
  ['mukkebi','먹깨비','STORE_DISCOVERY_MUKKEBI_URL'],
  ['daangn_order','당근 주문','STORE_DISCOVERY_DAANGN_URL'],
  ['naver_order','네이버 주문','STORE_DISCOVERY_NAVER_URL'],
]);
const AUTO_MATCH=.95;
const REVIEW_MATCH=.70;
const clean=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();
const digits=value=>clean(value).replace(/\D/g,'');
const safeUrl=value=>{try{const url=new URL(clean(value));return url.protocol==='https:'?url.href:''}catch{return''}};
const tokens=value=>new Set(clean(value).toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').split(/\s+/).filter(Boolean));
function tokenScore(a,b){const aa=tokens(a),bb=tokens(b);if(!aa.size||!bb.size)return null;let hit=0;for(const item of aa)if(bb.has(item))hit++;return hit/Math.max(aa.size,bb.size)}
function phoneScore(a,b){const aa=digits(a),bb=digits(b);if(!aa||!bb)return null;return aa===bb?1:(aa.slice(-8)===bb.slice(-8)?0.92:0)}
function addressScore(a,b){return tokenScore(clean(a).replace(/대한민국|전라남도|전남/g,''),clean(b).replace(/대한민국|전라남도|전남/g,''));}
function geoScore(query,candidate){
  const qlat=Number(query?.lat),qlng=Number(query?.lng),clat=Number(candidate?.lat),clng=Number(candidate?.lng);
  if(![qlat,qlng,clat,clng].every(Number.isFinite))return null;
  const rad=Math.PI/180,dlat=(clat-qlat)*rad,dlng=(clng-qlng)*rad;
  const a=Math.sin(dlat/2)**2+Math.cos(qlat*rad)*Math.cos(clat*rad)*Math.sin(dlng/2)**2;
  const km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return km<=.05?1:km<=.2?.95:km<=.5?.8:km<=1?.55:km<=3?.2:0;
}
export function scoreStoreCandidate(query={},candidate={}){
  const signals=[
    ['name',.30,tokenScore(query.name,candidate.name)],
    ['phone',.35,phoneScore(query.phone,candidate.phone)],
    ['address',.25,addressScore(query.address,candidate.address||candidate.roadAddress)],
    ['geo',.10,geoScore(query,candidate)],
  ].filter(([,weight,value])=>value!==null&&Number.isFinite(value));
  const weight=signals.reduce((sum,item)=>sum+item[1],0)||1;
  const score=signals.reduce((sum,item)=>sum+item[1]*item[2],0)/weight;
  return {score:Number(score.toFixed(4)),signals:Object.fromEntries(signals.map(([key,,value])=>[key,Number(value.toFixed(4))]))};
}
export function matchBand(score){return score>=AUTO_MATCH?'auto':score>=REVIEW_MATCH?'review':'candidate'}
function normalizeCandidate(provider,item={}){
  const candidate={
    provider,
    providerStoreId:clean(item.providerStoreId||item.storeId||item.id),
    name:clean(item.name||item.title),
    address:clean(item.address||item.roadAddress),
    phone:clean(item.phone||item.telephone),
    lat:Number.isFinite(Number(item.lat))?Number(item.lat):null,
    lng:Number.isFinite(Number(item.lng))?Number(item.lng):null,
    storeUrl:safeUrl(item.storeUrl||item.url||item.link),
    orderUrl:safeUrl(item.orderUrl||item.publicOrderUrl),
    imageUrl:safeUrl(item.imageUrl||item.image),
    sourceUrl:safeUrl(item.sourceUrl||item.storeUrl||item.url||item.link),
    menu:Array.isArray(item.menu)?item.menu.slice(0,200):[],
  };
  return candidate.name?candidate:null;
}
export function resolveStoreCandidates(query={},candidateMap={}){
  const providers=[];
  for(const [id,label] of PROVIDERS){
    const ranked=(Array.isArray(candidateMap[id])?candidateMap[id]:[]).map(item=>normalizeCandidate(id,item)).filter(Boolean)
      .map(candidate=>({...candidate,...scoreStoreCandidate(query,candidate)})).sort((a,b)=>b.score-a.score);
    const best=ranked[0]||null;
    providers.push({provider:id,label,count:ranked.length,best:best?{...best,match:matchBand(best.score)}:null,candidates:ranked.slice(0,5)});
  }
  return {ok:true,query:{name:clean(query.name),address:clean(query.address),phone:clean(query.phone)},thresholds:{auto:AUTO_MATCH,review:REVIEW_MATCH},providers};
}
function adapterUrl(env,key){return safeUrl(env?.[key]||'')}
function brokerUrl(env){return safeUrl(env?.STORE_DISCOVERY_BROKER_URL||'')}
export function storeDiscoveryProviderStatus(env={}){
  const broker=brokerUrl(env);
  return PROVIDERS.map(([provider,label,key])=>({provider,label,configured:Boolean(broker||adapterUrl(env,key)||(provider==='naver_order'&&clean(env.NAVER_SEARCH_CLIENT_ID)&&clean(env.NAVER_SEARCH_CLIENT_SECRET))),mode:broker?'broker':adapterUrl(env,key)?'official-proxy':provider==='naver_order'&&clean(env.NAVER_SEARCH_CLIENT_ID)&&clean(env.NAVER_SEARCH_CLIENT_SECRET)?'naver-openapi':'unconfigured'}));
}
async function postJson(url,payload,fetchImpl=fetch,headers={}){
  const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json',...headers},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`adapter_${response.status}`);
  return data;
}
async function naverSearch(query,env,fetchImpl=fetch){
  const q=[query.name,query.address].filter(Boolean).join(' ');
  const url=`https://openapi.naver.com/v1/search/local.json?display=5&query=${encodeURIComponent(q)}`;
  const response=await fetchImpl(url,{headers:{accept:'application/json','X-Naver-Client-Id':clean(env.NAVER_SEARCH_CLIENT_ID),'X-Naver-Client-Secret':clean(env.NAVER_SEARCH_CLIENT_SECRET)}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.errorMessage||`naver_${response.status}`);
  return {candidates:(data.items||[]).map(item=>({name:clean(item.title),address:item.roadAddress||item.address,phone:item.telephone,storeUrl:item.link,sourceUrl:item.link}))};
}
async function runProvider(provider,label,key,query,env,fetchImpl){
  const broker=brokerUrl(env),direct=adapterUrl(env,key);
  try{
    let data,mode='unconfigured';
    if(broker){data=await postJson(broker,{provider,query},fetchImpl);mode='broker';}
    else if(direct){data=await postJson(direct,{query,provider},fetchImpl);mode='official-proxy';}
    else if(provider==='naver_order'&&clean(env.NAVER_SEARCH_CLIENT_ID)&&clean(env.NAVER_SEARCH_CLIENT_SECRET)){data=await naverSearch(query,env,fetchImpl);mode='naver-openapi';}
    else return {provider,label,status:'unconfigured',mode,candidates:[]};
    const candidates=(Array.isArray(data?.candidates)?data.candidates:Array.isArray(data?.items)?data.items:[]).map(item=>normalizeCandidate(provider,item)).filter(Boolean);
    return {provider,label,status:'ok',mode,candidates};
  }catch(error){return {provider,label,status:'error',mode:broker?'broker':direct?'official-proxy':'naver-openapi',error:clean(error.message),candidates:[]};}
}
export async function discoverStores(query={},env={},fetchImpl=fetch){
  const normalized={name:clean(query.name),address:clean(query.address),phone:clean(query.phone),lat:query.lat,lng:query.lng};
  if(!normalized.name)return {ok:false,error:'store_name_required',providers:[]};
  const rows=await Promise.all(PROVIDERS.map(([provider,label,key])=>runProvider(provider,label,key,normalized,env,fetchImpl)));
  const candidateMap=Object.fromEntries(rows.map(row=>[row.provider,row.candidates]));
  const resolved=resolveStoreCandidates(normalized,candidateMap);
  const byProvider=new Map(resolved.providers.map(row=>[row.provider,row]));
  return {ok:true,query:resolved.query,thresholds:resolved.thresholds,providers:rows.map(row=>({...row,...byProvider.get(row.provider),candidates:(byProvider.get(row.provider)?.candidates||[])})),generatedAt:new Date().toISOString(),externalMutation:false};
}
export const STORE_DISCOVERY_PROVIDERS=Object.freeze(PROVIDERS.map(([id,label])=>({id,label})));
