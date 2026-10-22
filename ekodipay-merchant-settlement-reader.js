// EKODI Pay private, READ-ONLY per-merchant Toss settlement page collector.
// Never export this module to public Workers or use it for fund movement.
// Caller MUST be an authenticated, tenant-authorized, first-party scheduler.
import {indexMerchantProfiles} from './ekodipay-merchant-contract.js';
import {settlementQueryPlan} from './ekodipay-settlement-reconciliation.js';

const merchantIdRe=/^[a-z][a-z0-9_-]{2,39}$/;
const midRe=/^[A-Za-z0-9_-]{4,14}$/;
const txnRe=/^[A-Za-z0-9_-]{6,200}$/;
const money=x=>Number.isSafeInteger(x)&&Math.abs(x)<=10_000_000_000;
const methods=new Set(['카드','가상계좌','간편결제','휴대폰','계좌이체','문화상품권','도서문화상품권','게임문화상품권']);
const copyRow=(row)=>({
 mId:row.mId,transactionKey:row.transactionKey,paymentKey:row.paymentKey,
 orderId:row.orderId,currency:row.currency,method:row.method,
 amount:row.amount,payOutAmount:row.payOutAmount,
 fees:Array.isArray(row.fees)?row.fees.map(f=>({type:f.type,fee:f.fee})):[],
 soldDate:row.soldDate,paidOutDate:row.paidOutDate
});
function bindingForTenant({merchantId,mode,profiles,env,authorizedMerchantIds}={}){
 if(!merchantIdRe.test(merchantId||'')||!['test','live'].includes(mode)||
   !(authorizedMerchantIds instanceof Set)||!authorizedMerchantIds.has(merchantId))
  throw Error('tenant_read_not_authorized');
 // The profiles and authorized Set MUST come from trusted server-only storage and session.
 // NEVER deserialize them from a public request.
 const registry=indexMerchantProfiles(profiles);
 const profile=registry.merchants.get(merchantId);
 if(!profile||profile.state!=='verified')throw Error('verified_merchant_required');
 const mid=profile.midByMode?.[mode],ref=profile.credentialRefs?.[mode]?.secret;
 if(!midRe.test(mid||'')||typeof ref!=='string')throw Error('tenant_mid_binding_missing');
 const secret=env?.[ref];
 if(typeof secret!=='string'||!secret.startsWith(mode==='test'?'test_gsk_':'live_gsk_')||secret.length<22)
  throw Error('tenant_secret_binding_missing');
 return {mid,secret};
}
export async function readTenantPgSettlementPages({
 merchantId,mode,profiles,env,authorizedMerchantIds,startDate,endDate,
 dateType='soldDate',size=100,maxPages=20,fetchImpl=fetch
}={}){
 // This does not execute any POST endpoint, confirm a payment, or create a bank credit.
 const {mid,secret}=bindingForTenant({merchantId,mode,profiles,env,authorizedMerchantIds});
 if(!Number.isInteger(size)||size<1||size>500||
   !Number.isInteger(maxPages)||maxPages<1||maxPages>100||
   typeof fetchImpl!=='function')throw Error('invalid_private_settlement_read_limits');
 // Validates ISO dates/range before making a single network request.
 settlementQueryPlan({startDate,endDate,dateType,page:1,size});
 const rows=[],seen=new Set();let pagesRead=0,complete=false;
 for(let page=1;page<=maxPages;page++){
  const route=settlementQueryPlan({startDate,endDate,dateType,page,size});
  const url='https://api.tosspayments.com'+route;
  let response;
  try{
   response=await fetchImpl(url,{method:'GET',headers:{
     authorization:'Basic '+btoa(secret+':'),accept:'application/json'
   },signal:AbortSignal.timeout(70000)});
  }catch{throw Error('pg_settlement_transport_unavailable')}
  if(!response||response.status===429)throw Error('pg_settlement_rate_limited_or_unavailable');
  if(!response.ok)throw Error('pg_settlement_provider_read_failed');
  let batch;try{batch=await response.json()}catch{throw Error('invalid_pg_settlement_response')}
  if(!Array.isArray(batch)||batch.length>size)throw Error('invalid_pg_settlement_page');
  for(const row of batch){
   if(!row||row.mId!==mid||row.currency!=='KRW'||
     !txnRe.test(row.transactionKey||'')||!txnRe.test(row.paymentKey||'')||
     !txnRe.test(row.orderId||'')||!money(row.amount)||!money(row.payOutAmount)||
     !methods.has(row.method)||
     !Array.isArray(row.fees)||row.fees.some(f=>!f||!money(f.fee)||typeof f.type!=='string')||
     typeof row.soldDate!=='string'||typeof row.paidOutDate!=='string')
    throw Error('cross_tenant_or_invalid_pg_settlement');
   if(seen.has(row.transactionKey))throw Error('duplicate_pg_transaction_across_pages');
   seen.add(row.transactionKey);
   // Drop all customer, card and bank fields even if returned by the PG.
   rows.push(copyRow(row));
  }
  pagesRead++;
  if(batch.length<size){complete=true;break}
 }
 if(!complete)throw Error('pg_settlement_pagination_incomplete');
 // A successful HTTPS response and complete pagination do NOT prove a bank deposit
 // or authorize any PG payout, merchant activation or public result.
 return Object.freeze({
  merchantId,mode,mid,rows,pagesRead,paginationComplete:true,
  bankDepositVerified:false,readOnly:true,issuer:'first_party_pg_read',
 });
}
