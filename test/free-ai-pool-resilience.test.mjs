// FREE-AI-POOL-RESILIENCE-20261021 regression suite.
// Production evidence (2026-10-19..20, ai_provider_calls): openrouter-free returned 6 empty translations
// from the random openrouter/free router; gemini returned 5 opaque gemini_400_failed_precondition and the
// Claude check returned an opaque anthropic_400_invalid_request_error after a key reconnect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterFreeProvider } from '../openrouter-free-provider-adapter.js';
import { describeProviderHttpError, describeProviderCheckDiagnostic } from '../ai-provider-control.js';

const json=body=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
const env={ENVIRONMENT:'test',OPENROUTER_API_KEY:'sk-or-test',EKODI_PROVIDER_OPENROUTER_FREE_ENABLED:'true'};

test('OpenRouter retries an empty free-router answer once and reports the model that answered', async () => {
  let calls=0;
  const provider=createOpenRouterFreeProvider(env,{fetchImpl:async()=>{calls+=1;return calls===1?json({model:'a/free',choices:[{message:{content:null},finish_reason:'stop'}]}):json({model:'b/free',choices:[{message:{content:'번역문'},finish_reason:'stop'}]})}});
  const result=await provider.invoke({prompt:'translate'});
  assert.equal(result.text,'번역문');
  assert.equal(result.model,'b/free');
  assert.equal(result.attempts,2);
  assert.equal(calls,2);
});

test('OpenRouter retry is bounded and a length cut-off is not retried', async () => {
  let calls=0;
  const empty=createOpenRouterFreeProvider(env,{fetchImpl:async()=>{calls+=1;return json({choices:[{message:{content:''},finish_reason:'stop'}]})}});
  await assert.rejects(()=>empty.invoke({prompt:'x'}),/openrouter_free_empty_response_stop/);
  assert.equal(calls,2,'default allows exactly one retry');
  calls=0;
  const cut=createOpenRouterFreeProvider(env,{fetchImpl:async()=>{calls+=1;return json({choices:[{message:{content:''},finish_reason:'length'}]})}});
  await assert.rejects(()=>cut.invoke({prompt:'x'}),/openrouter_free_empty_response_length/);
  assert.equal(calls,1);
  calls=0;
  const off=createOpenRouterFreeProvider({...env,EKODI_OPENROUTER_FREE_EMPTY_RETRY:'0'},{fetchImpl:async()=>{calls+=1;return json({choices:[{message:{content:''}}]})}});
  await assert.rejects(()=>off.invoke({prompt:'x'}),/openrouter_free_empty_response$/);
  assert.equal(calls,1);
});

test('OpenRouter HTTP errors are not retried', async () => {
  let calls=0;
  const provider=createOpenRouterFreeProvider(env,{fetchImpl:async()=>{calls+=1;return new Response(JSON.stringify({error:{code:429,message:'Rate limit exceeded: free-models-per-day'}}),{status:429,headers:{'content-type':'application/json'}})}});
  await assert.rejects(()=>provider.invoke({prompt:'x'}),error=>error.status===429);
  assert.equal(calls,1);
});

test('Gemini location rejection is named precisely and treated as a retryable region block', () => {
  const error=describeProviderHttpError('gemini',400,{error:{code:400,status:'FAILED_PRECONDITION',message:'User location is not supported for the API use.'}});
  assert.equal(error.message,'gemini_400_location_unsupported');
  const diagnostic=describeProviderCheckDiagnostic(error);
  assert.equal(diagnostic.category,'region-blocked');
  assert.equal(diagnostic.retryable,true);
  const billing=describeProviderHttpError('gemini',400,{error:{code:400,status:'FAILED_PRECONDITION',message:'Gemini API free tier is not available in your country. Please enable billing.'}});
  assert.equal(billing.message,'gemini_400_failed_precondition','billing preconditions keep the existing code');
});

test('Claude low credit balance is named precisely and classified as billing', () => {
  const error=describeProviderHttpError('anthropic',400,{type:'error',error:{type:'invalid_request_error',message:'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'}});
  assert.equal(error.message,'anthropic_400_credit_balance_low');
  assert.equal(describeProviderCheckDiagnostic(error).category,'credit-or-billing');
  const other=describeProviderHttpError('anthropic',400,{type:'error',error:{type:'invalid_request_error',message:'max_tokens: field required'}});
  assert.equal(other.message,'anthropic_400_invalid_request_error');
});
