// EKODI Pay read-only PG settlement comparison.
// Payment settlement API rows never themselves prove bank deposits.
// Run per merchant+MID+environment with complete paginated PG evidence.
const KNOWN=new Set(['DONE','CANCELED','PARTIAL_CANCELED']);
const KEY=/^[a-zA-Z0-9_-]{6,200}$/;
const money=n=>Number.isSafeInteger(n)&&Math.abs(n)<=10_000_000_000;
const mask=k=>typeof k==='string'?k.slice(0,3)+'…'+k.slice(-3):'unknown';
export function reconcileMerchantSettlements({
 merchantId,mid,mode,localTransactions,pgSettlements,
 sourceVerified=false,paginationComplete=false,bankEvidence=null,expectedAccountFingerprint=''
}={}){
 if(!/^[a-z][a-z0-9_-]{2,39}$/.test(merchantId||'')||
   !/^[A-Za-z0-9_-]{4,14}$/.test(mid||'')||!['test','live'].includes(mode)||
   !Array.isArray(localTransactions)||!Array.isArray(pgSettlements))
   throw Error('invalid_reconciliation_input');
 if(localTransactions.length>20000||pgSettlements.length>20000)
   throw Error('reconciliation_batch_limit');
 const issues=[],matched=[],providerByTransaction=new Map(),localByTransaction=new Map();
 for(const p of pgSettlements){
   const tx=String(p?.transactionKey||'');
   if(!KEY.test(tx)){issues.push({code:'invalid_provider_transaction'});continue}
   if(providerByTransaction.has(tx)){issues.push({code:'duplicate_provider_transaction',transaction:mask(tx)});continue}
   providerByTransaction.set(tx,p);
 }
 for(const l of localTransactions){
   const tx=String(l?.transactionKey||'');
   if(!KEY.test(tx)){issues.push({code:'invalid_local_transaction'});continue}
   if(localByTransaction.has(tx)){issues.push({code:'duplicate_local_transaction',transaction:mask(tx)});continue}
   localByTransaction.set(tx,l);
 }
 let localAmount=0,providerAmount=0,localPayout=0,providerPayout=0;
 for(const [tx,l] of localByTransaction){
   if(l.merchantId!==merchantId||l.pgMode!==mode||l.mId!==mid||
       !KNOWN.has(l.status)||!money(l.amount)||!money(l.expectedPayoutAmount)||
       !KEY.test(l.paymentKey)||!KEY.test(l.orderId)){
     issues.push({code:'invalid_or_cross_merchant_local_entry',transaction:mask(tx)});continue;
   }
   const p=providerByTransaction.get(tx);
   if(!p){issues.push({code:'missing_pg_settlement',transaction:mask(tx)});continue}
   if(p.mId!==mid||p.currency!=='KRW'||p.orderId!==l.orderId||p.paymentKey!==l.paymentKey||
       !money(p.amount)||!money(p.payOutAmount)||p.amount!==l.amount||
       p.payOutAmount!==l.expectedPayoutAmount){
      issues.push({code:'merchant_order_amount_or_payout_mismatch',transaction:mask(tx)});continue;
   }
   if(p.fees!==undefined&&(!Array.isArray(p.fees)||p.fees.some(f=>!money(f.fee)))){
     issues.push({code:'invalid_provider_fee',transaction:mask(tx)});continue;
   }
   localAmount+=l.amount;providerAmount+=p.amount;
   localPayout+=l.expectedPayoutAmount;providerPayout+=p.payOutAmount;
   matched.push({transaction:mask(tx),status:l.status,amount:l.amount,payout:p.payOutAmount});
 }
 for(const [tx,p] of providerByTransaction){
   if(!localByTransaction.has(tx))issues.push({
     code:'unknown_pg_settlement',transaction:mask(tx)});
   if(p.mId!==mid)issues.push({code:'cross_merchant_pg_mid',transaction:mask(tx)});
 }
 if(!sourceVerified)issues.push({code:'unverified_pg_source'});
 if(!paginationComplete)issues.push({code:'incomplete_pg_pagination'});
 // PG paidOutAmount and paidOutDate are NOT bank account deposit confirmation.
 const pgReconciled=issues.length===0&&matched.length===localTransactions.length&&
   matched.length===pgSettlements.length;
 // A PG payout schedule is not evidence of a bank credit. Accept a separate
 // authenticated bank-statement attestation for the same merchant and HMAC account.
 const bankDepositVerified=pgReconciled&&matched.length>0&&
   bankEvidence?.source==='authenticated_bank_statement'&&
   bankEvidence?.verified===true&&bankEvidence?.merchantId===merchantId&&
   bankEvidence?.creditDirection==='CREDIT'&&
   typeof bankEvidence?.statementTransactionRef==='string'&&
   /^[A-Z0-9_-]{8,100}$/.test(bankEvidence.statementTransactionRef)&&
   /^[a-f0-9]{64}$/i.test(expectedAccountFingerprint)&&
   bankEvidence?.accountFingerprint===expectedAccountFingerprint&&
   bankEvidence?.currency==='KRW'&&bankEvidence?.amount===providerPayout&&
   typeof bankEvidence?.proofRef==='string'&&/^[A-Z0-9_-]{8,100}$/.test(bankEvidence.proofRef)&&
   Number.isSafeInteger(bankEvidence?.verifiedAt)&&bankEvidence.verifiedAt>0;
 return Object.freeze({
   merchantId,mode,pgReconciled,bankDepositVerified:!!bankDepositVerified,
   disposition:!pgReconciled?'requires_review':bankDepositVerified?'bank_verified':'bank_deposit_pending',
   totals:{localAmount,providerAmount,localPayout,providerPayout},
   matchedCount:matched.length,pgRows:pgSettlements.length,localRows:localTransactions.length,
   issues,matched
 });
}
export function settlementQueryPlan({startDate,endDate,dateType='soldDate',page=1,size=100}={}){
 const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
   !Number.isNaN(new Date(s+'T00:00:00Z').getTime())&&
   new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!validDate(startDate)||!validDate(endDate)||startDate>endDate||
    !['soldDate','paidOutDate'].includes(dateType)||
    !Number.isInteger(page)||page<1||
    !Number.isInteger(size)||size<1||size>5000)
   throw Error('invalid_settlement_query');
 // Return only the relative API pathname; requester must use selected
 // merchant's own secret and verified provider domain on the SERVER.
 const qs=new URLSearchParams({startDate,endDate,dateType,page:String(page),size:String(size)});
 return '/v1/settlements?'+qs.toString();
}
