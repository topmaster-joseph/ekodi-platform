import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTossReadOnlyHoldings} from '../invest-toss-holdings-normalizer.js';

const KR=()=>({symbol:'005930',name:'삼성전자',marketCountry:'KR',currency:'KRW',quantity:'10',marketValue:{purchaseAmount:'500000',amount:'650000',amountAfterCost:'640000'}});
const US=()=>({symbol:'AAPL',name:'Apple Inc.',marketCountry:'US',currency:'USD',quantity:'1.25',marketValue:{purchaseAmount:'110.55',amount:'125.25',amountAfterCost:'125.00'}});
const response=(items=[KR(),US()],totals={krw:'650000',usd:'125.25'})=>({
 result:{
  totalPurchaseAmount:{krw:'500000',usd:'110.55'},
  marketValue:{amount:totals,amountAfterCost:{krw:'640000',usd:'125.00'}},
  profitLoss:{rate:'0.1'},dailyProfitLoss:{rate:'0.01'},items
 }
});
test('official-shaped Toss holdings segregate KRW and USD using exact decimals without conversion',()=>{
 const p=normalizeTossReadOnlyHoldings(response());
 assert.equal(p.accepted,true);
 assert.equal(p.holdingsTotals.KRWMinor,'65000000');
 assert.equal(p.holdingsTotals.USDMinor,'12525');
 assert.deepEqual(p.positions.map(x=>x.market),['KR','US']);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.positions)&&Object.isFrozen(p.positions[0]));
 assert.equal(p.includesCash,false);
 assert.equal(p.fxConversionPerformed,false);
 assert.equal(p.sourceAuthenticated,false);
 assert.equal(p.ownerBindingVerified,false);
 assert.equal(p.accountConnected,false);
 assert.equal(p.networkCallPerformed,false);
 assert.equal(p.liveOrdersEnabled,false);
});
test('KR-only account permits nullable USD overview without combining cash/equity',()=>{
 const r=normalizeTossReadOnlyHoldings(response([KR()],{krw:'650000',usd:null}));
 assert.equal(r.accepted,true);
 assert.equal(r.holdingsTotals.USDMinor,null);
 assert.equal(r.positions.length,1);
});
test('malformed overview, subtotal mismatch and mixed currencies are rejected',()=>{
 assert.equal(normalizeTossReadOnlyHoldings(response([KR(),US()],{krw:'650000',usd:null})).reason,'TOSS_HOLDINGS_TOTAL_MISMATCH');
 assert.equal(normalizeTossReadOnlyHoldings(response([KR(),US()],{krw:'650000',usd:'125.24'})).reason,'TOSS_HOLDINGS_TOTAL_MISMATCH');
 assert.equal(normalizeTossReadOnlyHoldings(response([KR(),US()],{krw:'0',usd:'125.25'})).reason,'TOSS_HOLDINGS_TOTAL_MISMATCH');
 assert.equal(normalizeTossReadOnlyHoldings(response([KR()],{krw:'650000',usd:'-1'})).reason,'TOSS_HOLDINGS_TOTAL_INVALID');
 assert.equal(normalizeTossReadOnlyHoldings(response([{...KR(),currency:'USD'}],{krw:'650000',usd:null})).reason,'TOSS_HOLDINGS_INSTRUMENT_INVALID');
});
test('scientific notation, negative numbers, too many decimal places and duplicate securities fail closed',()=>{
 assert.equal(normalizeTossReadOnlyHoldings(response([{...KR(),quantity:'1e5'}],{krw:'650000',usd:null})).reason,'TOSS_HOLDINGS_QUANTITY_INVALID');
 assert.equal(normalizeTossReadOnlyHoldings(response([{...KR(),quantity:'-1'}],{krw:'650000',usd:null})).reason,'TOSS_HOLDINGS_QUANTITY_INVALID');
 assert.equal(normalizeTossReadOnlyHoldings(response([{...KR(),marketValue:{amount:'0.001'}}],{krw:'650000',usd:null})).reason,'TOSS_HOLDINGS_VALUE_INVALID');
 assert.equal(normalizeTossReadOnlyHoldings(response([KR(),KR()],{krw:'1300000',usd:null})).reason,'TOSS_HOLDINGS_DUPLICATE');
});
test('unsupported schema, malicious fields and an oversized response cannot be treated as accepted connection',()=>{
 for(const raw of [null,[],{}, {result:{items:{}}},{result:{items:Array(301).fill(KR()),marketValue:{amount:{krw:'0',usd:null}}}}]){
  const r=normalizeTossReadOnlyHoldings(raw);
  assert.equal(r.accepted,false);
  assert.equal(r.liveOrdersEnabled,false);
 }
 const injected=response([ {...KR(),name:'=HYPERLINK("https://bad.example")',token:'token-secret-1',accountNo:'private'}],{krw:'650000',usd:null});
 const result=normalizeTossReadOnlyHoldings(injected);
 assert.equal(result.accepted,true);
 assert.ok(!JSON.stringify(result).includes('token-secret-1'));
 assert.ok(!JSON.stringify(result).includes('accountNo'));
});
