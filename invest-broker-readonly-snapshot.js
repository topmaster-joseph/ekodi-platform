// EKODI Invest: deterministic normalization of ALREADY-OBTAINED read-only broker data.
// This module is not a provider adapter: it does NOT authenticate, fetch, or store data.
// Never use it to declare a live broker connected or to enable money orders.
import { resolveBrokerReadOnlyTarget } from './invest-broker-readonly-contract.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYMBOL=/^[A-Z0-9.\-]{1,20}$/;
const ISO_UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const AMOUNT=/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const QTY=/^(?:0|[1-9]\d{0,9})(?:\.\d{1,8})?$/;
const ALLOWED_CURRENCIES=new Set(['KRW','USD']);
const ALLOWED_MARKETS=new Set(['KR','US']);
const SNAPSHOT_KEYS=new Set(['brokerId','environment','accountRef','snapshotRef','capturedAt','currency','cashAmount','reportedTotal','positions']);
const POSITION_KEYS=new Set(['symbol','market','currency','quantity','marketValue']);
const fail=(code)=>Object.freeze({accepted:false,error:code,connected:false,readOnlyConnectionVerified:false,networkCallPerformed:false,liveOrdersEnabled:false});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const onlyKeys=(obj,keys)=>Object.keys(obj).every(key=>keys.has(key));
const amountMinor=value=>{
 if(typeof value!=='string'||!AMOUNT.test(value))return null;
 const [whole,fraction='']=value.split('.');
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')||'0');
};
const minorString=value=>value.toString();
const quantityValid=value=>typeof value==='string'&&QTY.test(value);
function checkIdentity(left,right){
 return left.brokerId===right.brokerId&&left.environment===right.environment
   &&left.accountRef===right.accountRef&&left.currency===right.currency;
}

// The output is an UNTRUSTED, sanitized snapshot ready for separate server-side
// owner/account binding and official provider evidence verification.
export function normalizeBrokerReadOnlySnapshot(input,{now=Date.now(),maxAgeMs=5*60*1000}={}){
 if(!plain(input)||!onlyKeys(input,SNAPSHOT_KEYS))return fail('UNEXPECTED_SNAPSHOT_FIELDS');
 const target=resolveBrokerReadOnlyTarget({brokerId:input.brokerId,environment:input.environment,operation:'holdings'});
 if(!target.allowed)return fail('BROKER_ENVIRONMENT_NOT_ALLOWED');
 if(!UUID.test(String(input.accountRef||''))||!UUID.test(String(input.snapshotRef||'')))return fail('OPAQUE_REFERENCES_REQUIRED');
 if(!ALLOWED_CURRENCIES.has(input.currency))return fail('UNSUPPORTED_CURRENCY');
 if(typeof input.capturedAt!=='string'||!ISO_UTC.test(input.capturedAt))return fail('INVALID_CAPTURE_TIME');
 const captured=Date.parse(input.capturedAt);
 if(!Number.isFinite(captured)||new Date(captured).toISOString()!==new Date(input.capturedAt).toISOString())return fail('INVALID_CAPTURE_TIME');
 if(!Number.isFinite(now)||!Number.isFinite(maxAgeMs)||maxAgeMs<0||captured>now+30000||now-captured>maxAgeMs)return fail('STALE_OR_FUTURE_SNAPSHOT');
 const cash=amountMinor(input.cashAmount);
 if(cash===null)return fail('INVALID_CASH_AMOUNT');
 if(!Array.isArray(input.positions)||input.positions.length>300)return fail('INVALID_POSITION_COUNT');
 const seen=new Set(),positions=[];let holdingsTotal=0n;
 for(const raw of input.positions){
  if(!plain(raw)||!onlyKeys(raw,POSITION_KEYS))return fail('UNEXPECTED_POSITION_FIELDS');
  if(typeof raw.symbol!=='string'||!SYMBOL.test(raw.symbol)||!ALLOWED_MARKETS.has(raw.market))return fail('INVALID_INSTRUMENT');
  if(raw.currency!==input.currency)return fail('CROSS_CURRENCY_SNAPSHOT');
  if(!quantityValid(raw.quantity))return fail('INVALID_QUANTITY');
  const value=amountMinor(raw.marketValue);
  if(value===null)return fail('INVALID_MARKET_VALUE');
  const key=raw.market+':'+raw.symbol;
  if(seen.has(key))return fail('DUPLICATE_POSITION');
  seen.add(key);holdingsTotal+=value;
  positions.push(Object.freeze({symbol:raw.symbol,market:raw.market,currency:raw.currency,quantity:raw.quantity,marketValueMinor:minorString(value)}));
 }
 const total=cash+holdingsTotal;
 if(input.reportedTotal!==undefined){
  const reported=amountMinor(input.reportedTotal);
  if(reported===null||reported!==total)return fail('BROKER_TOTAL_MISMATCH');
 }
 return Object.freeze({
  accepted:true,scheme:'ekodi.invest.read-only-snapshot.v1',
  brokerId:input.brokerId,environment:input.environment,
  accountRef:input.accountRef,snapshotRef:input.snapshotRef,
  capturedAt:input.capturedAt,currency:input.currency,
  cashMinor:minorString(cash),holdingsMinor:minorString(holdingsTotal),
  totalMinor:minorString(total),positions:Object.freeze(positions),
  // Sanitization is NOT proof of the real provider's permission or data accuracy.
  sourceAuthenticated:false,ownerBindingVerified:false,connected:false,
  readOnlyConnectionVerified:false,networkCallPerformed:false,liveOrdersEnabled:false
 });
}
export function compareBrokerReadOnlySnapshots(previous,current){
 if(previous?.accepted!==true||current?.accepted!==true)return fail('SNAPSHOT_NOT_ACCEPTED');
 if(!checkIdentity(previous,current))return fail('CROSS_ACCOUNT_OR_ENVIRONMENT');
 if(previous.snapshotRef===current.snapshotRef)return fail('DUPLICATE_SNAPSHOT');
 const t0=Date.parse(previous.capturedAt),t1=Date.parse(current.capturedAt);
 if(!(Number.isFinite(t0)&&Number.isFinite(t1)&&t1>t0))return fail('NON_MONOTONIC_SNAPSHOT');
 const oldTotal=BigInt(previous.totalMinor),newTotal=BigInt(current.totalMinor);
 return Object.freeze({
  compared:true,brokerId:current.brokerId,environment:current.environment,
  accountRef:current.accountRef,currency:current.currency,
  previousSnapshotRef:previous.snapshotRef,currentSnapshotRef:current.snapshotRef,
  totalChangeMinor:minorString(newTotal-oldTotal),
  cashChangeMinor:minorString(BigInt(current.cashMinor)-BigInt(previous.cashMinor)),
  holdingsChangeMinor:minorString(BigInt(current.holdingsMinor)-BigInt(previous.holdingsMinor)),
  accountDataReadOnly:true,orderExecutionPerformed:false,connected:false
 });
}
