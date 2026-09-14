import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import registry from '../config/capability-registry.json' with {type:'json'};
import {AI_COMMONS_POLICY,canFinalPublish,canPromoteIdeaStatus,normalizeAiIdeaInput,rankCommonCapabilities,suggestedIdeaState,userIdeaStatus} from '../ai-commons.js';

test('AI Commons policy keeps complete free first value',()=>{
  assert.equal(AI_COMMONS_POLICY.surface,'/ai');
  assert.equal(AI_COMMONS_POLICY.freeMemberPrinciple,'complete-first-value');
  assert.equal(AI_COMMONS_POLICY.directProductionPromotion,false);
});

test('natural language intent ranks reusable capabilities',()=>{
  const results=rankCommonCapabilities('가게 마케팅 홍보 콘텐츠 만들기',registry,5);
  assert.ok(Array.isArray(results));
  assert.ok(results.length>0);
  assert.ok(results.every(item=>!('providerId' in item)));
});
test('idea input is bounded and lifecycle cannot skip verification',()=>{
  const idea=normalizeAiIdeaInput({problem:'반복 홍보가 어렵다',outcome:'홍보물 자동 생성',audience:'소상공인'});
  assert.equal(idea.problem,'반복 홍보가 어렵다');
  assert.throws(()=>normalizeAiIdeaInput({problem:'',outcome:'x',audience:'y'}),/problem_required/);
  assert.equal(canPromoteIdeaStatus('candidate','shared'),false);
  assert.equal(canPromoteIdeaStatus('candidate','sandboxed'),true);
  assert.equal(canPromoteIdeaStatus('staged','shared'),true);
  assert.equal(suggestedIdeaState([{score:14}]),'reuse_suggested');
});

test('AI progress labels and final publish gate stay distinct',()=>{
  assert.equal(userIdeaStatus('submitted'),'요청접수');
  assert.equal(userIdeaStatus('triaged'),'검토중');
  assert.equal(userIdeaStatus('candidate'),'개발중');
  assert.equal(userIdeaStatus('sandboxed'),'테스트중');
  assert.equal(userIdeaStatus('verified'),'검증완료');
  assert.equal(userIdeaStatus('staged'),'공개준비중');
  assert.equal(canFinalPublish('verified'),false);
  assert.equal(canFinalPublish('staged'),true);
});

test('public route is wired through the AI service binding',()=>{
  const worker=fs.readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
  assert.match(worker,/url\.pathname === '\/ai'/);
  assert.match(worker,/env\.AI\?\.fetch/);
  const wrangler=fs.readFileSync(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(wrangler,/"\/ai\*"/);
});
test('admin build publishes the AI Commons governance module',()=>{
  const build=fs.readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  assert.match(build,/ai-commons-admin\.js/);
});
