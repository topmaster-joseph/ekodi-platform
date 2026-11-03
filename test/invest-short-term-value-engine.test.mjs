import test from 'node:test';
import assert from 'node:assert/strict';
import {SHORT_VALUE_SCHEMA,SHORT_VALUE_POLICY,screenShortTermValue} from '../invest-short-term-value-engine.js';

const NOW=Date.parse('2026-11-03T08:00:00.000Z');
const make=(symbol='005930',extra={})=>({
  symbol,market:'KR',assetType:'STOCK',sector:'반도체',
  quote:{asOf:new Date(NOW-60_000).toISOString(),priceKRW:80000,turnoverKRW:5_000_000_000,
    spreadPct:0.15,return20dPct:7,return60dPct:12,volatility20dPct:22},
  financials:{publishedAt:new Date(NOW-40*86400_000).toISOString(),pe:9,sectorMedianPe:16,
    pb:0.8,sectorMedianPb:1.5,fcfYieldPct:8,roePct:17,netDebtToEbitda:0.5,
    operatingCashFlowPositive:1,earningsRevision90dPct:8},
  provenance:{quoteProvider:'kis',financialProvider:'opendart'},risk:{},
  ...extra
});
test('deterministic valuation ranks verified-format input without producing any order instruction',()=>{
  const a=screenShortTermValue({candidates:[make('005930'),make('000660',{financials:{...make().financials,pe:25,pb:3,fcfYieldPct:1,roePct:4,netDebtToEbitda:3,earningsRevision90dPct:-9}})]},{now:NOW});
  const b=screenShortTermValue({candidates:[make('005930'),make('000660',{financials:{...make().financials,pe:25,pb:3,fcfYieldPct:1,roePct:4,netDebtToEbitda:3,earningsRevision90dPct:-9}})]},{now:NOW});
  assert.equal(a.schema,SHORT_VALUE_SCHEMA);
  assert.deepEqual(a,b);
  assert.equal(a.ranked[0].symbol,'005930');
  assert.ok(a.ranked[0].score>a.ranked[1].score);
  assert.equal(a.ranked[0].executionEligible,false);
  assert.equal(a.ordersPlaced,false);
  assert.equal(a.paperOrdersPlaced,false);
  assert.equal(a.liveOrdersEnabled,false);
  assert.equal(a.autoOrderSubmission,false);
  assert.match(a.ranked[0].dataBasis,/not_independently_attested/);
  assert.match(a.ranked[0].uncertainty,/매매 신호가 아닙니다/);
});
test('never scores data without fresh KIS quotes and OpenDART financial provenance',()=>{
  const staleQ=make('111111',{quote:{...make().quote,asOf:new Date(NOW-26*3600_000).toISOString()}});
  const staleF=make('222222',{financials:{...make().financials,publishedAt:new Date(NOW-230*86400_000).toISOString()}});
  const fabricated=make('333333',{provenance:{quoteProvider:'self',financialProvider:'unknown'}});
  const incomplete=make('444444',{financials:{...make().financials,roePct:null}});
  const future=make('555555',{quote:{...make().quote,asOf:new Date(NOW+60_000).toISOString()}});
  const r=screenShortTermValue({candidates:[staleQ,staleF,fabricated,incomplete,future]},{now:NOW});
  assert.equal(r.ranked.length,0);
  for(const [code,symbol] of [['QUOTE_STALE','111111'],['FINANCIALS_STALE','222222'],['PROVENANCE_UNVERIFIED','333333'],['FINANCIAL_FIELDS_INCOMPLETE','444444']]){
    assert.ok(r.excluded.find(x=>x.symbol===symbol).reasons.includes(code));
  }
  assert.ok(r.excluded.find(x=>x.symbol==='555555').reasons.includes('QUOTE_STALE'));
});
test('liquidity, regulatory warnings, quote risks and duplicates fail closed',()=>{
  const weak=make('111111',{quote:{...make().quote,turnoverKRW:200_000_000,spreadPct:4,volatility20dPct:85},
    risk:{unresolvedMaterialDisclosure:true}});
  const r=screenShortTermValue({candidates:[weak,make('005930'),make('005930')]},{now:NOW});
  assert.equal(r.ranked.length,1);
  assert.deepEqual(new Set(r.excluded[0].reasons),new Set(['MATERIAL_RISK_FLAG','LOW_LIQUIDITY','WIDE_SPREAD','VOLATILITY_RISK']));
  assert.ok(r.excluded[1].reasons.includes('DUPLICATE_SYMBOL'));
  assert.equal(r.ranked[0].symbol,'005930');
});
test('rejects invalid instruments, massive universes and invalid clocks',()=>{
  assert.ok(screenShortTermValue({candidates:[make('SPY',{market:'US'})]},{now:NOW}).excluded[0].reasons.includes('UNSUPPORTED_SECURITY'));
  const r=screenShortTermValue({candidates:Array.from({length:SHORT_VALUE_POLICY.maxCandidates+1},(_,i)=>make(String(i).padStart(6,'0')) )},{now:NOW});
  assert.equal(r.error,'UNIVERSE_LIMIT'); assert.equal(r.ordersPlaced,false);
  assert.throws(()=>screenShortTermValue({},{now:NaN}),/INVALID_NOW/);
});
