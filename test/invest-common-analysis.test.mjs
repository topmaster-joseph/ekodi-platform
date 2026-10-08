import test from 'node:test';
import assert from 'node:assert/strict';
import { INVEST_COMMON_CANDIDATES, handleInvestCommonAnalysisApi } from '../invest-common-analysis-runtime.js';
const URL='https://ekodi.kr/v1/invest/common-analysis';
const bearer='a'.repeat(50);
const authenticated=(url=URL)=>new Request(url,{headers:{authorization:'Bearer '+bearer}});
const withFetch=async(mock,run)=>{const original=globalThis.fetch;globalThis.fetch=mock;try{return await run()}finally{globalThis.fetch=original}};
const member={id:'member-1',email:'member@example.com',email_confirmed_at:'2026-10-01T00:00:00Z'};
const identity=async()=>new Response(JSON.stringify(member),{status:200,headers:{'content-type':'application/json'}});
test('member common-analysis data is never accessible without a validated token',async()=>{
 const response=await handleInvestCommonAnalysisApi(new Request(URL));
 assert.equal(response.status,401);
 assert.equal((await response.json()).error,'auth_required');
});
test('member common-analysis data excludes personalized fields and unverified prices',async()=>{
 await withFetch(identity,async()=>{
  const response=await handleInvestCommonAnalysisApi(authenticated());
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const result=await response.json();
  assert.equal(result.policy.memberOnly,true);
  assert.equal(result.policy.personalized,false);
  assert.equal(result.policy.estimatedReturnAvailable,false);
  assert.equal(result.provenance.marketDataVerified,false);
  assert.equal(result.provenance.asOf,null);
  assert.deepEqual(result.candidates,INVEST_COMMON_CANDIDATES);
  assert.ok(result.candidates.every(row=>!('price' in row||'personalScore' in row)));
 });
});
test('authenticated shared filters are deterministic without a personal subject',async()=>{
 await withFetch(identity,async()=>{
  const filtered=await handleInvestCommonAnalysisApi(authenticated(URL+'?market=kr&period=1y&target=20'));
  assert.equal(filtered.status,200);
  const payload=await filtered.json();
  assert.equal(payload.market,'kr');
  assert.equal(payload.period,'1y');
  assert.equal(payload.targetReturnPct,20);
  assert.equal(payload.candidates.length,2);
  assert.equal(payload.policy.personalized,false);
  const invalid=await handleInvestCommonAnalysisApi(authenticated(URL+'?market=personalized'));
  assert.equal(invalid.status,400);
 });
});
test('unconfirmed identity is rejected even with valid-looking bearer',async()=>{
 await withFetch(async()=>new Response(JSON.stringify({id:'member-1',email:'member@example.com'}),{status:200}),async()=>{
  const response=await handleInvestCommonAnalysisApi(authenticated());
  assert.equal(response.status,401);
 });
});
test('cross-origin request cannot access authenticated Invest data',async()=>{
 const response=await handleInvestCommonAnalysisApi(new Request(URL,{headers:{origin:'https://attacker.invalid',authorization:'Bearer '+bearer}}));
 assert.equal(response.status,403);
});
