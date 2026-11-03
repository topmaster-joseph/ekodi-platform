// EKODI Invest · Short-horizon undervaluation research (deterministic, read-only).
// Accepts broker/filing-derived structured observations, never provider credentials.
// Important: input metadata can be claimed by a caller and is NOT independent
// provider attestation. A ranking here cannot authorize even a paper order.
export const SHORT_VALUE_SCHEMA='ekodi.invest.short-term-value-research.v1';
export const SHORT_VALUE_POLICY=Object.freeze({
  maxCandidates:30, maxQuoteAgeMs:24*3600_000, maxFinancialAgeMs:220*86400_000,
  minDailyTurnoverKRW:1_000_000_000, maxSpreadPct:1.5, maxVolatility20dPct:65,
  independentProviderAttestationRequiredForExecution:true,
  liveOrdersEnabled:false, automaticOrderSubmission:false, decisionAuthority:'research_only'
});
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const inRange=(v,min,max)=>finite(v)&&v>=min&&v<=max;
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const round=(v)=>Number(v.toFixed(2));
const fresh=(iso,age,now)=>{
  if(typeof iso!=='string'||!/^\d{4}-\d\d-\d\dT/.test(iso))return false;
  const ts=Date.parse(iso);
  return Number.isFinite(ts)&&ts<=now+30_000&&ts>now-age;
};
function score(value,low,high){return clamp((value-low)/(high-low)*100);}
function validate(c,now){
  const errors=[];
  if(!c||typeof c!=='object'||Array.isArray(c))return ['INVALID_CANDIDATE'];
  if(!/^\d{6}$/.test(c.symbol||'')||c.market!=='KR'||c.assetType!=='STOCK')errors.push('UNSUPPORTED_SECURITY');
  const q=c.quote||{}, f=c.financials||{}, p=c.provenance||{}, r=c.risk||{};
  if(p.quoteProvider!=='kis'||p.financialProvider!=='opendart')errors.push('PROVENANCE_UNVERIFIED');
  if(!fresh(q.asOf,SHORT_VALUE_POLICY.maxQuoteAgeMs,now))errors.push('QUOTE_STALE');
  if(!fresh(f.publishedAt,SHORT_VALUE_POLICY.maxFinancialAgeMs,now))errors.push('FINANCIALS_STALE');
  if(!inRange(q.priceKRW,1,1e9)||!inRange(q.turnoverKRW,0,1e15)||
     !inRange(q.spreadPct,0,100)||!inRange(q.return20dPct,-100,100)||
     !inRange(q.return60dPct,-100,500)||!inRange(q.volatility20dPct,0,500))errors.push('QUOTE_FIELDS_INCOMPLETE');
  if(!inRange(f.pe,0.1,1000)||!inRange(f.sectorMedianPe,0.1,1000)||
     !inRange(f.pb,0.05,100)||!inRange(f.sectorMedianPb,0.05,100)||
     !inRange(f.fcfYieldPct,-100,100)||!inRange(f.roePct,-200,200)||
     !inRange(f.netDebtToEbitda,-100,100)||!inRange(f.operatingCashFlowPositive,0,1)||
     !inRange(f.earningsRevision90dPct,-100,500))errors.push('FINANCIAL_FIELDS_INCOMPLETE');
  if(r.tradingHalt===true||r.delistingWarning===true||r.unresolvedMaterialDisclosure===true)
    errors.push('MATERIAL_RISK_FLAG');
  if(finite(q.turnoverKRW)&&q.turnoverKRW<SHORT_VALUE_POLICY.minDailyTurnoverKRW)
    errors.push('LOW_LIQUIDITY');
  if(finite(q.spreadPct)&&q.spreadPct>SHORT_VALUE_POLICY.maxSpreadPct)errors.push('WIDE_SPREAD');
  if(finite(q.volatility20dPct)&&q.volatility20dPct>SHORT_VALUE_POLICY.maxVolatility20dPct)errors.push('VOLATILITY_RISK');
  return errors;
}
function scoreCandidate(c){
  const f=c.financials,q=c.quote;
  // Relative valuation is sector-aware. Absolute low P/E alone is not a catalyst.
  const peDiscount=(1-f.pe/f.sectorMedianPe)*100;
  const pbDiscount=(1-f.pb/f.sectorMedianPb)*100;
  const factors={
    value:round(0.45*score(peDiscount,-10,45)+0.35*score(pbDiscount,-15,50)+0.20*score(f.fcfYieldPct,0,10)),
    quality:round(0.35*score(f.roePct,0,25)+0.35*f.operatingCashFlowPositive*100+
      0.30*score(-f.netDebtToEbitda,-4,2)),
    revision:round(score(f.earningsRevision90dPct,-10,18)),
    trend:round(0.6*score(q.return20dPct,-20,15)+0.4*score(q.return60dPct,-30,30)),
    executionRisk:round(0.5*score(q.spreadPct,0,SHORT_VALUE_POLICY.maxSpreadPct)+
      0.5*score(q.volatility20dPct,10,SHORT_VALUE_POLICY.maxVolatility20dPct))
  };
  const total=round(clamp(0.38*factors.value+0.27*factors.quality+
      0.18*factors.revision+0.17*factors.trend-0.10*factors.executionRisk));
  return {symbol:c.symbol,market:c.market,sector:String(c.sector||'미분류').slice(0,64),
    asOf:q.asOf,score:total,factors,
    valuation:{peDiscountPct:round(peDiscount),pbDiscountPct:round(pbDiscount)},
    dataBasis:'caller_supplied_observations_not_independently_attested',
    decision:total>=70?'priority_review':total>=50?'watchlist':'insufficient_edge',
    executionEligible:false,
    uncertainty:'상대가치·실적·수급 지표 기반의 연구 순위이며 수익률 예측이나 매매 신호가 아닙니다.'};
}
export function screenShortTermValue(input={},opts={}){
  const now=opts.now??Date.now();
  if(!Number.isFinite(now))throw new TypeError('INVALID_NOW');
  const items=Array.isArray(input.candidates)?input.candidates:[];
  if(items.length>SHORT_VALUE_POLICY.maxCandidates)
    return {schema:SHORT_VALUE_SCHEMA,error:'UNIVERSE_LIMIT',maxCandidates:SHORT_VALUE_POLICY.maxCandidates,ordersPlaced:false};
  const seen=new Set(),ranked=[],excluded=[];
  for(const c of items){
    const errors=validate(c,now);
    if(c&&typeof c.symbol==='string'){
      if(seen.has(c.symbol))errors.push('DUPLICATE_SYMBOL');
      seen.add(c.symbol);
    }
    if(errors.length){excluded.push({symbol:typeof c?.symbol==='string'?c.symbol.slice(0,12):null,reasons:[...new Set(errors)]});continue;}
    ranked.push(scoreCandidate(c));
  }
  ranked.sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol));
  return {schema:SHORT_VALUE_SCHEMA,generatedAt:new Date(now).toISOString(),dataBasis:'caller_supplied_unverified',
    horizon:'short_term_research',ranked,excluded,universeCount:items.length,
    providerRequirements:{quoteProvider:'kis',financialProvider:'opendart',KisFinancialApisRetiringAt:'2026-11-11T16:00:00+09:00'},
    caveats:['외부 투자정보의 진위는 이 엔진만으로 확인할 수 없음','미공개정보나 투자 수익을 예측하지 않음',
      '비용·세금·시장충격·장중 리스크는 체결 전에 별도 확인 필요'],
    ordersPlaced:false,paperOrdersPlaced:false,liveOrdersEnabled:false,
    autoOrderSubmission:false,nextAction:'owner_review_then_independent_risk_and_paper_validation'};
}
