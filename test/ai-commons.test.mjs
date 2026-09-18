import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import registry from '../config/capability-registry.json' with {type:'json'};
import {AI_COMMONS_POLICY,adminIdeaView,canFinalPublish,canPromoteIdeaStatus,executionCatalogSnapshot,memberIdeaView,normalizeAiIdeaInput,publicRequestView,rankCommonCapabilities,rankPublicExecutionServices,suggestedIdeaState,userIdeaStatus} from '../ai-commons.js';

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
test('public execution catalog and ranked services hide capability internals',()=>{
  const catalog=executionCatalogSnapshot(registry);
  const ranked=rankPublicExecutionServices('가게 마케팅 홍보 콘텐츠 만들기',registry,5);
  const serialized=JSON.stringify({catalog,ranked});
  assert.doesNotMatch(serialized,/capabilityId|providerId|actionTier|maturity/);
  assert.ok(ranked.length>0);
  assert.ok(ranked.every(item=>item.launchUrl.startsWith('https://ekodi.kr/')));
});

test('public and member request projections hide orchestration internals while admin keeps them',()=>{
  const row={id:'public-id',fingerprint:'secret-fingerprint',problem:'반복 업무',outcome:'업무 자동화',audience:'회원',current_way:'수동',
    status:'staged',request_count:4,matched_capability_id:'core.secret',development_task_id:'task-secret',review_decision:'hold',
    source_service_id:'source-a',source_services:'source-a,source-b',created_at:'2026-09-18T00:00:00Z',updated_at:'2026-09-18T01:00:00Z'};
  const publicView=publicRequestView(row);const memberView=memberIdeaView(row);const adminView=adminIdeaView(row);
  for(const view of [publicView,memberView]){
    const serialized=JSON.stringify(view);
    assert.doesNotMatch(serialized,/secret-fingerprint|core\.secret|task-secret|reviewDecision|matchedCapabilityId|developmentTaskId|fingerprint/);
  }
  assert.equal(publicView.requestCount,4);
  assert.equal('id' in publicView,false);
  assert.equal(memberView.outcome,'업무 자동화');
  assert.equal(adminView.matchedCapabilityId,'core.secret');
  assert.equal(adminView.developmentTaskId,'task-secret');
});

test('public commons API does not expose capability registry or raw capability matches',()=>{
  const worker=fs.readFileSync(new URL('../ai-control-worker.js',import.meta.url),'utf8');
  assert.match(worker,/url\.pathname==='\/api\/commons\/capabilities'\)return json\(\{error:'operator_surface_moved'\},410\)/);
  assert.match(worker,/return json\(\{services:rankPublicExecutionServices\(job,capabilityRegistry,5\)\}\)/);
  assert.doesNotMatch(worker,/\/api\/commons\/match'[\s\S]{0,500}matches:rankCommonCapabilities/);
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

test('Commons page loads browser assets only through the Worker-owned API boundary',()=>{
  const html=fs.readFileSync(new URL('../ai-control/commons.html',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('../ai-control-worker.js',import.meta.url),'utf8');
  const verifier=fs.readFileSync(new URL('../.github/workflows/verify-ai-gateway-production.yml',import.meta.url),'utf8');
  assert.match(html,/\.\/api\/commons\/client\.js\?v=/);
  assert.match(html,/\.\/api\/commons\/client\.css\?v=/);
  assert.doesNotMatch(html,/\.\/commons\.js\?v=/);
  assert.doesNotMatch(html,/\.\/commons\.css\?v=/);
  assert.match(worker,/\/api\/commons\/client\.js/);
  assert.match(worker,/\/api\/commons\/client\.css/);
  assert.match(worker,/x-ekodi-ai-asset/);
  assert.match(verifier,/ai\/api\/commons\/client\.js/);
  assert.match(verifier,/capabilityId/);
  assert.match(verifier,/api\('\/ai\/api\/commons\//);
});

test('public route is wired through the AI service binding',()=>{
  const worker=fs.readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
  assert.match(worker,/url\.pathname === '\/ai'/);
  assert.match(worker,/env\.AI\?\.fetch/);
  const wrangler=fs.readFileSync(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(wrangler,/"\/ai"/);
  assert.match(wrangler,/"\/ai\/\*"/);
  assert.doesNotMatch(wrangler,/"\/ai\*"/);
});
test('admin build publishes the AI Commons governance module',()=>{
  const build=fs.readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  assert.match(build,/ai-commons-admin\.js/);
});
