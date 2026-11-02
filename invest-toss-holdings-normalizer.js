// EKODI Invest — side-effect-free validation of Toss Securities GET /api/v1/holdings.
// Official reference: https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
// No OAuth, account header, provider fetch, real order, credential or owner attestation here.
// Holdings are segregated by currency; "holdings value" is NEVER total account equity.
const CURRENCY=Object.freeze({KR:'KRW',US:'USD'});
const DECIMAL=/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const QUANTITY=/^(?:0|[1-9]\d{0,12})(?:\.\d{1,8})?$/;
const SYMBOL=/^[A-Z0-9.\-]{1,20}$/;
const MAX_ITEMS=300;
const fail=code=>Object.freeze({
 accepted:false,reason:code,sourceAuthenticated:false,ownerBindingVerified:false,
 accountConnected:false,readOnlyConnectionVerified:false,networkCallPerformed:false,
 liveOrdersEnabled:false,orderExecutionPerformed:false
});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function cents(value) {
 if(typeof value!=='string'||!DECIMAL.test(value))return null;
 const [whole,part='']=value.split('.');
 return BigInt(whole)*100n+BigInt(part.padEnd(2,'0')||'0');
}
const safeName=v=>typeof v==='string'?v.slice(0,80):'';
function safeOverview(value) {
 if(!object(value))return null;
 const krw=cents(value.krw);
 const usd=value.usd===null?null:cents(value.usd);
 return krw===null||value.usd!==null&&usd===null?null:{krw,usd};
}
export function normalizeTossReadOnlyHoldings(payload) {
 if(!object(payload)||!object(payload.result)||!Array.isArray(payload.result.items)||
    payload.result.items.length>MAX_ITEMS)return fail('TOSS_HOLDINGS_RESPONSE_INVALID');
 const declared=safeOverview(payload.result.marketValue?.amount);
 if(!declared)return fail('TOSS_HOLDINGS_TOTAL_INVALID');
 let sums={KRW:0n,USD:0n};
 const seen=new Set(),positions=[];
 for(const item of payload.result.items) {
  if(!object(item)||!(item.marketCountry in CURRENCY)||item.currency!==CURRENCY[item.marketCountry]||
     typeof item.symbol!=='string'||!SYMBOL.test(item.symbol))return fail('TOSS_HOLDINGS_INSTRUMENT_INVALID');
  if(typeof item.quantity!=='string'||!QUANTITY.test(item.quantity))return fail('TOSS_HOLDINGS_QUANTITY_INVALID');
  const value=cents(item.marketValue?.amount);
  if(value===null)return fail('TOSS_HOLDINGS_VALUE_INVALID');
  const key=item.marketCountry+':'+item.symbol;
  if(seen.has(key))return fail('TOSS_HOLDINGS_DUPLICATE');
  seen.add(key);
  sums[item.currency]+=value;
  positions.push(Object.freeze({
   symbol:item.symbol,market:item.marketCountry,currency:item.currency,
   name:safeName(item.name),quantity:item.quantity,marketValueMinor:value.toString()
  }));
 }
 if(sums.KRW!==declared.krw||declared.usd===null&&sums.USD!==0n||
    declared.usd!==null&&sums.USD!==declared.usd)return fail('TOSS_HOLDINGS_TOTAL_MISMATCH');
 return Object.freeze({
  accepted:true,schema:'ekodi.invest.toss-holdings-normalized.v1',
  source:'toss-official-api-payload-unverified',
  holdingsTotals:Object.freeze({KRWMinor:sums.KRW.toString(),USDMinor:declared.usd===null?null:sums.USD.toString()}),
  positions:Object.freeze(positions),
  includesCash:false,includesPendingOrders:false,fxConversionPerformed:false,
  sourceAuthenticated:false,ownerBindingVerified:false,accountConnected:false,
  readOnlyConnectionVerified:false,networkCallPerformed:false,
  liveOrdersEnabled:false,orderExecutionPerformed:false
 });
}
