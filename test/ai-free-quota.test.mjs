import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_FREE_QUOTA_POLICY,
  classifyFreeQuotaError,
  configuredFreeProviderIds,
  freePoolSnapshot,
  hasAlternateZeroCostExecution,
} from '../ai-free-quota.js';

test('free quota policy never auto escalates to paid APIs',()=>{
  assert.equal(AI_FREE_QUOTA_POLICY.paidAutoEscalation,false);
  assert.equal(AI_FREE_QUOTA_POLICY.paidDecisionRequired,true);
});

test('configured free provider inventory is provider-neutral',()=>{
  assert.deepEqual(configuredFreeProviderIds({
    cloudflareWorkersAi:true,
    geminiFree:true,
    openrouterFree:true,
    groqFree:true,
  }),['cloudflare-workers-ai','gemini-free','openrouter-free','groq-free']);
});

test('daily free-limit errors are classified as exhausted',()=>{
  const error=new Error('OPENROUTER_FREE_DAILY_FREE_LIMIT');
  error.status=429;
  error.quota={state:'exhausted',remainingRequests:0,resetAt:'2026-09-19T00:00:00.000Z'};
  const result=classifyFreeQuotaError('openrouter-free',error,Date.parse('2026-09-18T12:00:00Z'));
  assert.equal(result.state,'exhausted');
  assert.equal(result.remainingRequests,0);
  assert.equal(result.resetAt,'2026-09-19T00:00:00.000Z');
});

test('short provider rate limits are throttled instead of treated as daily exhaustion',()=>{
  const error=new Error('gemini_429_resource_exhausted');
  error.status=429;error.retryAfterSeconds=60;
  const result=classifyFreeQuotaError('gemini-free',error,Date.parse('2026-09-18T12:00:00Z'));
  assert.equal(result.state,'throttled');
  assert.equal(result.resetAt,'2026-09-18T12:01:00.000Z');
});

test('paid decision is required only when every configured free provider is exhausted and no zero-cost lane remains',async()=>{
  const rows=[
    {provider_id:'gemini-free',state:'exhausted',remaining_requests:0,remaining_tokens:null,reset_at:'2026-09-19T00:00:00.000Z',last_error:'quota',last_observed_at:'2026-09-18T11:00:00Z'},
    {provider_id:'cloudflare-workers-ai',state:'exhausted',remaining_requests:0,remaining_tokens:null,reset_at:'2026-09-19T00:00:00.000Z',last_error:'limit',last_observed_at:'2026-09-18T11:00:00Z'},
  ];
  const DB={prepare(){return{bind(){return this},async all(){return{results:rows}}}}};
  const snapshot=await freePoolSnapshot({DB},['gemini-free','cloudflare-workers-ai'],{nowMs:Date.parse('2026-09-18T12:00:00Z')});
  assert.equal(snapshot.allExhausted,true);
  assert.equal(snapshot.paidDecisionRequired,true);
  const withNode=await freePoolSnapshot({DB},['gemini-free','cloudflare-workers-ai'],{alternateZeroCostAvailable:true,nowMs:Date.parse('2026-09-18T12:00:00Z')});
  assert.equal(withNode.allExhausted,false);
  assert.equal(withNode.paidDecisionRequired,false);
});

test('account execution prevents premature paid escalation',()=>{
  assert.equal(hasAlternateZeroCostExecution({nodeProviders:['codex']}),true);
  assert.equal(hasAlternateZeroCostExecution({nodeProviders:[]}),false);
});
