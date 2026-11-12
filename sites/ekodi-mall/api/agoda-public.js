// Agoda Lite public search proxy — consented data only, never a credential endpoint.
// Fail closed until supplier HTTPS/auth/content rights and a curated city allowlist exist.
import { agodaLiteReadiness, agodaLiteCriteria, queryAgodaLite } from './agoda-lite.js';

const ON=v=>String(v??'').toLowerCase()==='true';
const J=(data,status=200)=>({body:data,status});
const MAX_CITIES=25;
const positive=v=>/^[1-9]\d{0,9}$/.test(String(v))&&Number.isSafeInteger(Number(v));
const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v??''));
const safeMessage={disabled:'아고다 공식 숙소 데이터 자동연동을 준비하고 있습니다.',empty:'이 조건으로 확인된 숙소가 없습니다.'};

export function agodaPublicCities(env={}){
  try {
    const items=JSON.parse(String(env.AGODA_AFFILIATE_CITIES_JSON||'[]'));
    if(!Array.isArray(items)||items.length>MAX_CITIES)return [];
    const seen=new Set();
    return items.flatMap(item=>{
      const id=String(item?.id??''),name=String(item?.name??'').trim();
      if(!positive(id)||!name||name.length>60||/[<>"'&]/.test(name)||seen.has(id))return [];
      seen.add(id); return [{id:Number(id),name}];
    });
  }catch{return []}
}
export function agodaPublicReady(env={}){
  const cities=agodaPublicCities(env);
  const certified=String(env.AGODA_AFFILIATE_SITE_ID||'')==='1980072';
  // The provider can disable the affiliate account or this CID independently of
  // the API credential. Never infer partner approval from an issued/installed key.
  // These must be verified from the authenticated Partner Center and deliberately
  // set by EKODI's authorized release controller, not inferred by a user query.
  const accountApproved=ON(env.AGODA_AFFILIATE_ACCOUNT_APPROVED_CONFIRMED);
  const cidActive=ON(env.AGODA_AFFILIATE_CID_ACTIVE_CONFIRMED);
  return ON(env.AGODA_AFFILIATE_PUBLIC_SEARCH_ENABLED)&&agodaLiteReadiness(env).ready&&certified&&accountApproved&&cidActive&&cities.length>0;
}
function searchInput(url,cities,now){
 const qs=url.searchParams;
 if([...qs.keys()].some(k=>!['cityId','checkInDate','checkOutDate','adults'].includes(k)))throw Object.assign(new Error('INVALID_SEARCH'),{code:'INVALID_SEARCH'});
 if(['cityId','checkInDate','checkOutDate','adults'].some(k=>qs.getAll(k).length!==1))throw Object.assign(new Error('INVALID_SEARCH'),{code:'INVALID_SEARCH'});
 const cityId=qs.get('cityId');
 const checkInDate=qs.get('checkInDate'),checkOutDate=qs.get('checkOutDate');
 const adults=qs.get('adults');
 if(!positive(cityId)||!cities.some(c=>String(c.id)===cityId)||!day(checkInDate)||!day(checkOutDate)||!/^[1-6]$/.test(adults||''))throw Object.assign(new Error('INVALID_SEARCH'),{code:'INVALID_SEARCH'});
 const inputs={cityId:Number(cityId),checkInDate,checkOutDate,adults:Number(adults)};
 agodaLiteCriteria(inputs,now);
 return inputs;
}
function publicHotel(row,expectedCid){
 try{
  const u=new URL(row.landingUrl);
  if(u.protocol!=='https:'||u.hostname!=='www.agoda.com'||u.pathname!=='/partners/partnersearch.aspx'||u.searchParams.getAll('cid').length!==1||u.searchParams.get('cid')!==String(expectedCid)||u.searchParams.getAll('hid').length!==1||u.searchParams.get('hid')!==String(row.hotelId)||u.searchParams.has('tag'))return null;
  u.searchParams.set('tag','ekodi_mall_stay');
  return {hotelId:row.hotelId,name:row.hotelName,imageUrl:row.imageUrl||'',landingUrl:u.href,nightlyRateKrw:row.dailyRate,starRating:row.starRating,reviewScore:row.reviewScore};
 }catch{return null}
}
export function agodaPublicResult(raw,env,query){
 const hotels=(raw.data||[]).slice(0,30).map(x=>publicHotel(x,env.AGODA_AFFILIATE_SITE_ID)).filter(Boolean);
 return {source:'Agoda Affiliate Lite',updatedAt:raw.checkedAt,checkInDate:query.checkInDate,checkOutDate:query.checkOutDate,cityId:query.cityId,hotels,priceNote:'숙박 조건에 따른 조회 시점의 1박 요금입니다. 최종 가격·예약 가능 여부는 아고다에서 확인하세요.'};
}
export async function handleAgodaPublicRequest(request,env={},ctx={},options={}){
 const url=new URL(request.url);
 if(!['/api/public/agoda/status','/api/public/agoda/search'].includes(url.pathname))return null;
 if(request.method!=='GET')return J({error:'METHOD_NOT_ALLOWED'},405);
 const cities=agodaPublicCities(env),enabled=agodaPublicReady(env);
 if(url.pathname==='/api/public/agoda/status')return J({available:enabled,cities:enabled?cities:[],message:enabled?'':'공식 데이터 연결 승인 전입니다.'});
 if(!enabled)return J({available:false,hotels:[],message:safeMessage.disabled},503);
 let q;
 try{q=searchInput(url,cities,options.now||new Date())}catch{return J({error:'INVALID_SEARCH'},400)}
 const cache=options.cache??(typeof caches!=='undefined'?caches.default:null);
 const key='https://ekodi.kr/ekodimall/api/api/public/agoda/search?'+new URLSearchParams({cityId:String(q.cityId),checkInDate:q.checkInDate,checkOutDate:q.checkOutDate,adults:String(q.adults)}).toString();
 if(cache){
  try{
   const hit=await cache.match(key);
   if(hit?.ok){const body=await hit.json();return J(body)}
  }catch{/* cache outage must not become an origin outage */}
 }
 try{
  const result=await queryAgodaLite(env,q,{fetchImpl:options.fetchImpl||fetch,now:options.now||new Date()});
  const body=agodaPublicResult(result,env,q);
  if(cache){
   const put=cache.put(key,new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300'}}));
   if(ctx?.waitUntil)ctx.waitUntil(Promise.resolve(put).catch(()=>{}));else await Promise.resolve(put).catch(()=>{});
  }
  return J(body);
 }catch(e){
  const code=String(e?.code||'');
  return J({available:false,hotels:[],message:'아고다의 현재 검색 결과를 불러오지 못했습니다.',error:code.startsWith('AGODA_')?code:'AGODA_PROVIDER_UNAVAILABLE'},503);
 }
}
