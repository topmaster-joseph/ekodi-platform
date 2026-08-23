import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fundingPolicyForPlan,
  classifyUserAiData,
  chooseUserAiRoute,
} from '../user-ai-control.js';
import { createGeminiPersonalProvider } from '../gemini-provider-adapter.js';
import { createSponsoredUserOpenAiProvider } from '../user-openai-provider-adapter.js';

test('FREE and FLEX never receive EKODI-sponsored AI by default', () => {
  for (const plan of ['free', 'flex']) {
    const policy = fundingPolicyForPlan(plan);
    assert.equal(policy.sponsoredRequests, 0);
    assert.equal(policy.sponsoredEligible, false);
  }
});

test('paid plans have bounded sponsored request allowances', () => {
  assert.equal(fundingPolicyForPlan('basic').sponsoredRequests, 25);
  assert.equal(fundingPolicyForPlan('plus').sponsoredRequests, 100);
  assert.equal(fundingPolicyForPlan('pro').sponsoredRequests, 500);
  assert.equal(fundingPolicyForPlan('auto').sponsoredRequests, 1500);
});

test('environment can lower or raise a plan allowance without code changes', () => {
  assert.equal(fundingPolicyForPlan('plus', { USER_AI_PLUS_MONTHLY_REQUESTS:'7' }).sponsoredRequests, 7);
  assert.equal(fundingPolicyForPlan('plus', { USER_AI_PLUS_MONTHLY_REQUESTS:'0' }).sponsoredEligible, false);
});

test('personal AI wins in automatic mode when it is safe and connected', () => {
  assert.equal(chooseUserAiRoute({ mode:'auto', hasPersonal:true, personalAllowed:true, sponsoredAvailable:true, sponsoredRemaining:100 }), 'personal-api');
});

test('FREE-like state without a personal API falls back to personal web, never sponsored', () => {
  assert.equal(chooseUserAiRoute({ mode:'auto', hasPersonal:false, personalAllowed:true, sponsoredAvailable:false, sponsoredRemaining:0 }), 'personal-web');
});

test('sensitive data classification blocks automatic personal free API routing', () => {
  assert.equal(classifyUserAiData('내 카드번호 1234를 분석해줘'), 'sensitive');
  assert.notEqual(chooseUserAiRoute({ mode:'auto', hasPersonal:true, personalAllowed:false, sponsoredAvailable:false, sponsoredRemaining:0 }), 'personal-api');
});

test('AI off keeps the Core-only route', () => {
  assert.equal(chooseUserAiRoute({ mode:'off', hasPersonal:true, personalAllowed:true, sponsoredAvailable:true, sponsoredRemaining:100 }), 'core-only');
});

test('Gemini personal adapter keeps the key in a header and uses the stable default model', async () => {
  let request = null;
  const provider = createGeminiPersonalProvider({
    apiKey:'test-gemini-key-abcdefghijklmnopqrstuvwxyz',
    fetchImpl:async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ candidates:[{ content:{ parts:[{ text:'개인 Gemini 응답' }] } }] }), { status:200, headers:{ 'content-type':'application/json' } });
    },
  });
  const result = await provider.invoke({ message:'안녕하세요' });
  assert.equal(result.text, '개인 Gemini 응답');
  assert.match(request.url, /gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(request.options.headers['x-goog-api-key'], 'test-gemini-key-abcdefghijklmnopqrstuvwxyz');
  assert.equal(request.url.includes('test-gemini-key'), false);
  assert.equal(JSON.stringify(JSON.parse(request.options.body)).includes('test-gemini-key'), false);
});

test('EKODI-sponsored OpenAI adapter disables response storage and does not put the key in the body', async () => {
  let request = null;
  const provider = createSponsoredUserOpenAiProvider({
    OPENAI_API_KEY:'sk-proj-test-key-abcdefghijklmnopqrstuvwxyz',
    OPENAI_MODEL:'gpt-5.6-terra',
  }, {
    fetchImpl:async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ id:'resp_test', model:'gpt-5.6-terra', output_text:'지원 AI 응답' }), { status:200, headers:{ 'content-type':'application/json' } });
    },
  });
  const result = await provider.invoke({ message:'도와줘', site:'marketing' });
  const body = JSON.parse(request.options.body);
  assert.equal(result.text, '지원 AI 응답');
  assert.equal(body.store, false);
  assert.equal(body.model, 'gpt-5.6-terra');
  assert.equal(JSON.stringify(body).includes('sk-proj-test-key'), false);
  assert.match(request.options.headers.authorization, /^Bearer /);
});
