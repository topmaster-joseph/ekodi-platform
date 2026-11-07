import test from 'node:test';
import assert from 'node:assert/strict';
import {investMyRoute} from '../invest-my-workspace.js';
import {screenShortTermValue} from '../invest-short-term-value-engine.js';

const read=async suffix=>{
 const response=await investMyRoute(new Request('https://ekodi.kr/invest/my'+suffix),{});
 assert.equal(response.status,200);
 return response.text();
};

test('candidate shortlist appears only inside the owner-gated investment research page',async()=>{
 const html=await read('/value');
 const owner=html.indexOf('<section id="owner" hidden>');
 const research=html.indexOf('id="shortValueResearch"');
 const input=html.indexOf('id="shortValueCandidateForm"');
 assert.ok(owner>=0&&research>owner&&input>research);
 assert.match(html,/id="shortValueCandidateJson"[^>]*maxlength="120000"/);
 assert.match(html,/id="shortValueAnalyze"/);
 assert.match(html,/id="shortValueCandidateClear"/);
 assert.match(html,/id="shortValueCandidateResults"/);
 assert.match(html,/id="shortValueCandidateStatus"/);
 assert.match(html,/분석 순위는 매수·매도 권유가 아니며 실주문과 연결되지 않습니다/);
 assert.match(html,/실거래 주문 잠금/);
});
test('client invokes existing owner-AAL2 read-only research endpoint, never broker orders',async()=>{
 const js=await read('/app.js');
 assert.match(js,/async function analyzeShortValueCandidates\(event\)/);
 assert.match(js,/apiCall\('POST','\/research\/short-term-value',payload\)/);
 assert.match(js,/data\.dataBasis!=='caller_supplied_unverified'/);
 assert.match(js,/data\.ordersPlaced!==false/);
 assert.match(js,/data\.liveOrdersEnabled!==false/);
 assert.match(js,/data\.autoOrderSubmission!==false/);
 assert.match(js,/el\('owner'\)\.hidden/);
 assert.match(js,/\.replaceChildren\(\)/);
 assert.match(js,/textContent=/);
 assert.doesNotMatch(js,/innerHTML|\/broker\/orders/);
});
test('read-only shortlist engine emits ranked research, never buy instructions',()=>{
 const now=Date.parse('2026-11-04T10:00:00Z');
 const observation={symbol:'005930',market:'KR',assetType:'STOCK',sector:'반도체',
  quote:{asOf:new Date(now-60000).toISOString(),priceKRW:72000,turnoverKRW:4000000000,spreadPct:.2,return20dPct:4,return60dPct:6,volatility20dPct:23},
  financials:{publishedAt:new Date(now-30*86400000).toISOString(),pe:8,sectorMedianPe:14,pb:.7,sectorMedianPb:1.4,fcfYieldPct:6,roePct:17,netDebtToEbitda:0.5,operatingCashFlowPositive:1,earningsRevision90dPct:5},
  provenance:{quoteProvider:'kis',financialProvider:'opendart'},risk:{}};
 const r=screenShortTermValue({candidates:[observation]},{now});
 assert.equal(r.ranked.length,1);
 assert.equal(r.ranked[0].symbol,'005930');
 assert.equal(r.ranked[0].executionEligible,false);
 assert.equal(r.ranked[0].dataBasis,'caller_supplied_observations_not_independently_attested');
 assert.equal(r.dataBasis,'caller_supplied_unverified');
 assert.equal(r.ordersPlaced,false);
 assert.equal(r.paperOrdersPlaced,false);
 assert.equal(r.liveOrdersEnabled,false);
 assert.equal(r.autoOrderSubmission,false);
 assert.ok(!('buyPrice' in r.ranked[0]));
 assert.ok(!('expectedReturn' in r.ranked[0]));
});
test('candidate import form reflows without page-width overflow',async()=>{
 const css=await read('/style.css');
 assert.match(css,/#shortValueCandidatePanel textarea\{[^}]*max-width:100%/);
 assert.match(css,/#shortValueCandidateResults\{max-width:100%;overflow-x:auto\}/);
 assert.match(css,/@media\(max-width:700px\)/);
});
