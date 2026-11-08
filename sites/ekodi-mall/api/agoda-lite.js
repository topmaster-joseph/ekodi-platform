// Agoda Affiliate Lite v2.0 read-only adapter. Not wired into public routes.
// Partner-approved HTTPS endpoint, request profile, content rights and Worker Secret are mandatory.
const str=v=>String(v??'').trim();
const on=v=>str(v).toLowerCase()==='true';
const problem=code=>Object.assign(new Error(code),{code});
const id=(v,max=2147483647)=>Number.isInteger(Number(v))&&Number(v)>0&&Number(v)<=max?Number(v):null;
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(str(v))&&!Number.isNaN(Date.parse(str(v)+'T00:00:00Z'))&&new Date(str(v)+'T00:00:00Z').toISOString().startsWith(str(v)+'T');
export function approvedAgodaLiteEndpoint(value){
 try{
  const u=new URL(str(value));
  if(u.protocol!=='https:'||!u.hostname.endsWith('.agoda.com')||u.hostname==='.agoda.com'||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/affiliateservice/lt_v1')return '';
  return u.href;
 }catch{return ''}
}
export function agodaLiteReadiness(env={}){
 const siteId=str(env.AGODA_AFFILIATE_SITE_ID),endpoint=approvedAgodaLiteEndpoint(env.AGODA_AFFILIATE_API_ENDPOINT),profile=str(env.AGODA_AFFILIATE_REQUEST_PROFILE);
 const blockers=[];
 if(!on(env.AGODA_AFFILIATE_ENABLED))blockers.push('DISABLED');
 if(!/^\d{6,10}$/.test(siteId))blockers.push('SITE_ID_REQUIRED');
 if(!str(env.AGODA_AFFILIATE_API_KEY))blockers.push('SECRET_REQUIRED');
 if(!endpoint||!on(env.AGODA_AFFILIATE_HTTPS_CONFIRMED))blockers.push('PROVIDER_HTTPS_CONFIRMATION_REQUIRED');
 if(!['header-and-body','header-only'].includes(profile))blockers.push('REQUEST_PROFILE_CONFIRMATION_REQUIRED');
 if(!on(env.AGODA_AFFILIATE_CONTENT_RIGHTS_APPROVED))blockers.push('CONTENT_RIGHTS_REQUIRED');
 return {ready:blockers.length===0,blockers,secretConfigured:Boolean(str(env.AGODA_AFFILIATE_API_KEY)),endpointConfigured:Boolean(endpoint)};
}
export function agodaLiteCriteria(input={},now=new Date()){
 const start=str(input.checkInDate),end=str(input.checkOutDate);
 if(!validDate(start)||!validDate(end))throw problem('INVALID_DATES');
 const today=Math.floor(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())/86400000);
 const a=Date.parse(start+'T00:00:00Z')/86400000,b=Date.parse(end+'T00:00:00Z')/86400000;
 if(a<today||a>today+365||b<=a||b>a+30)throw problem('DATES_OUT_OF_RANGE');
 const adults=Number(input.adults??2),children=Number(input.children??0),ages=input.childrenAges??[];
 if(!Number.isInteger(adults)||adults<1||adults>10||!Number.isInteger(children)||children<0||children>5||!Array.isArray(ages)||ages.length!==children||ages.some(x=>!Number.isInteger(x)||x<0||x>17))throw problem('INVALID_OCCUPANCY');
 const hotelIds=input.hotelIds,hotels=Array.isArray(hotelIds)&&hotelIds.length>0;
 if(hotels&&(hotelIds.length>30||hotelIds.some(x=>!id(x))||new Set(hotelIds.map(Number)).size!==hotelIds.length))throw problem('INVALID_HOTELS');
 if(!hotels&&!id(input.cityId))throw problem('CITY_ID_REQUIRED');
 const criteria={additional:{currency:'KRW',language:'ko-kr',discountOnly:false,occupancy:{numberOfAdult:adults,numberOfChildren:children}},checkInDate:start,checkOutDate:end};
 if(children)criteria.additional.occupancy.childrenAges=ages;
 if(hotels)criteria.hotelId=hotelIds.map(Number);
 else{criteria.cityId=Number(input.cityId);criteria.additional.maxResult=30;criteria.additional.sortBy='Recommended'}
 return {criteria};
}
function httpsUrl(value,kind){
 try{
  const u=new URL(str(value));
  if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
  if(kind==='landing'&&u.hostname!=='www.agoda.com')return '';
  if(kind==='image'&&u.hostname!=='agoda.net'&&!u.hostname.endsWith('.agoda.net'))return '';
  return u.href;
 }catch{return ''}
}
export function normalizeAgodaLiteResults(payload,expectedSiteId,checkedAt){
 const seen=new Set(),rows=Array.isArray(payload?.results)?payload.results:[];
 return rows.slice(0,30).flatMap(item=>{
  const hotelId=id(item?.hotelId),name=str(item?.hotelName).slice(0,160),url=httpsUrl(item?.landingURL,'landing');
  if(!hotelId||!name||!url||seen.has(hotelId))return [];
  const u=new URL(url);
  if(u.searchParams.get('cid')!==String(expectedSiteId)||u.searchParams.get('hid')!==String(hotelId))return [];
  seen.add(hotelId);
  const amount=Number(item?.dailyRate);
  const rate=item.currency==='KRW'&&Number.isFinite(amount)&&amount>0?Math.round(amount):null;
  const stars=Number(item?.starRating),score=Number(item?.reviewScore);
  return [{hotelId,hotelName:name,imageUrl:httpsUrl(item.imageURL,'image'),landingUrl:url,dailyRate:rate,currency:rate===null?null:'KRW',starRating:Number.isFinite(stars)&&stars>=0&&stars<=5?stars:null,reviewScore:Number.isFinite(score)&&score>=0&&score<=10?score:null,checkedAt,provider:'agoda'}];
 });
}
export async function queryAgodaLite(env,query,{fetchImpl=fetch,now=new Date()}={}){
 if(!agodaLiteReadiness(env).ready)throw problem('AGODA_NOT_READY');
 const body=agodaLiteCriteria(query,now),siteId=str(env.AGODA_AFFILIATE_SITE_ID),secret=str(env.AGODA_AFFILIATE_API_KEY);
 // Old PDF asserts matching body credentials but omits them in examples; explicit provider profile resolves this.
 if(env.AGODA_AFFILIATE_REQUEST_PROFILE==='header-and-body'){body.siteid=siteId;body.apikey=secret}
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),7500);
 try{
  const response=await fetchImpl(approvedAgodaLiteEndpoint(env.AGODA_AFFILIATE_API_ENDPOINT),{method:'POST',redirect:'error',signal:ctrl.signal,headers:{'Content-Type':'application/json','Accept':'application/json','Accept-Encoding':'gzip,deflate','Authorization':siteId+':'+secret},body:JSON.stringify(body)});
  if(!response.ok)throw problem(response.status===401?'AGODA_AUTH_REJECTED':response.status===403?'AGODA_PROVIDER_QUOTA_OR_ACCESS':'AGODA_PROVIDER_UNAVAILABLE');
  const raw=await response.text();
  if(raw.length>250000)throw problem('AGODA_OVERSIZED_RESPONSE');
  let obj;try{obj=JSON.parse(raw)}catch{throw problem('AGODA_INVALID_RESPONSE')}
  if(!Array.isArray(obj?.results))throw problem('AGODA_INVALID_RESPONSE');
  return {source:'Agoda Affiliate Lite',checkedAt:now.toISOString(),data:normalizeAgodaLiteResults(obj,siteId,now.toISOString())};
 }catch(e){
  if(e?.name==='AbortError')throw problem('AGODA_TIMEOUT');
  if(str(e?.code).startsWith('AGODA_'))throw e;
  throw problem('AGODA_PROVIDER_UNAVAILABLE');
 }finally{clearTimeout(timeout)}
}
