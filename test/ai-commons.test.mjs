import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import registry from '../config/capability-registry.json' with {type:'json'};
import {AI_COMMONS_POLICY,adminIdeaView,canFinalPublish,canPromoteIdeaStatus,executionCatalogSnapshot,listExecutionServices,memberIdeaView,normalizeAiIdeaInput,publicRequestView,rankCommonCapabilities,rankPublicExecutionServices,resolveExecutionServiceEntry,suggestedIdeaState,userIdeaStatus} from '../ai-commons.js';

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
test('public execution catalog projects common engines and specialist basics without internal authority data',()=>{
  const catalog=executionCatalogSnapshot(registry);
  const ranked=rankPublicExecutionServices('가게 마케팅 홍보 콘텐츠 만들기',registry,5);
  const serialized=JSON.stringify({catalog,ranked});
  assert.doesNotMatch(serialized,/capabilityId|providerId|actionTier|maturity|targetUrl|specialistServiceId|membershipSite/);
  assert.ok(ranked.length>0);
  assert.ok(ranked.every(item=>item.usableNow&&item.launchUrl.startsWith('https://ekodi.kr/ai/')));
  assert.ok(ranked.every(item=>['live','beta','integration-pending','read-only'].includes(item.availability)));
  assert.ok(ranked.every(item=>['direct','bridge'].includes(item.deliveryMode)));
  const services=catalog.categories.flatMap(category=>category.services);
  assert.equal(services.find(item=>item.id==='everyone-interpreter')?.deliveryMode,'direct');
  assert.equal(services.find(item=>item.id==='check-energy')?.availability,'read-only');
  assert.equal(services.find(item=>item.id==='run-business')?.availability,'integration-pending');
  assert.equal(services.find(item=>item.id==='common-core-project')?.status,'preview');
  assert.equal(services.find(item=>item.id==='specialist-bible')?.status,'ready');
  assert.equal(services.find(item=>item.id==='specialist-management')?.status,'preview');
  assert.equal(services.find(item=>item.id==='specialist-management')?.launchUrl,'');
  const marketing=services.find(item=>item.id==='make-marketing');
  assert.equal(marketing?.access?.basic,'public');
  assert.equal(marketing?.access?.advanced,'subscription');
  assert.equal(marketing?.access?.paidAvailable,true);
  assert.ok(services.filter(item=>item.usableNow).every(item=>item.description.length<=44));
  const device=services.find(item=>item.id==='common-device-observe');
  assert.equal(device?.status,'preview');
  assert.equal(device?.launchUrl,'');
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
  const client=fs.readFileSync(new URL('../ai-control/commons.js',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('../ai-control-worker.js',import.meta.url),'utf8');
  const canonical=fs.readFileSync(new URL('../canonical-surface-router.js',import.meta.url),'utf8');
  const verifier=fs.readFileSync(new URL('../.github/workflows/verify-ai-gateway-production.yml',import.meta.url),'utf8');
  const release=JSON.parse(fs.readFileSync(new URL('../deploy/manifests/ai-control.worker.json',import.meta.url),'utf8'));
  assert.match(html,/\.\/api\/commons\/client\?v=/);
  assert.match(html,/\.\/api\/commons\/style\?v=/);
  assert.match(html,/실행 서비스/);
  assert.match(html,/serviceTabs/);
  assert.match(html,/기본 기능 전체/);
  assert.match(html,/무엇을 하고 싶으세요\?/);
  assert.match(html,/개발 요청/);
  assert.match(client,/releasedRequests/);
  assert.match(client,/item\.status==='shared'/);
  assert.match(client,/\/api\/commons\/match/);
  assert.doesNotMatch(client,/FEATURED_PER_CATEGORY/);
  assert.match(client,/function serviceStatusMeta\(service\)/);
  assert.match(client,/availabilityLabel/);
  assert.match(client,/deliveryLabel/);
  assert.match(client,/function serviceAccessMeta\(service\)/);
  assert.match(client,/service\.access\?\.paidAvailable/);
  assert.match(client,/기본 무료 · 고급 구독/);
  assert.match(client,/기본 무료/);
  assert.doesNotMatch(client,/전문서비스 연결/);
  assert.doesNotMatch(html,/\.\/commons\.js\?v=/);
  assert.doesNotMatch(html,/\.\/commons\.css\?v=/);
  assert.doesNotMatch(html,/api\/commons\/client\.js/);
  assert.doesNotMatch(html,/api\/commons\/client\.css/);
  assert.match(worker,/\/api\/commons\/client/);
  assert.match(worker,/\/api\/commons\/style/);
  assert.match(worker,/x-ekodi-ai-asset/);
  assert.match(client,/function apiUrl\(path\)/);
  assert.match(client,/fetch\(apiUrl\(path\)/);
  assert.match(canonical,/spec\.basePathAware\|\|spec\.id==='ai'/);
  assert.match(verifier,/ai\/api\/commons\/client/);
  assert.doesNotMatch(verifier,/ai\/api\/commons\/client\.js/);
  assert.match(verifier,/capabilityId/);
  assert.match(verifier,/function apiUrl\(path\)/);
  assert.match(verifier,/ai\/ai\/api\/commons/);
  const clientProbe=release.worker.requests.find(item=>item.url.endsWith('/ai/api/commons/client'));
  assert.ok(clientProbe);
  assert.ok(clientProbe.expect.includes('function apiUrl(path)'));
  assert.ok(clientProbe.forbid.includes('/ai/ai/api/commons/'));
  assert.ok(clientProbe.candidateForbid.includes('/ai/ai/api/commons/'));
  assert.equal(clientProbe.forbid.includes('/ai/api/commons/'),false);
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


test('all executable service entries stay under /ai/ and advanced access uses central auth',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../config/ai-execution-services.json',import.meta.url),'utf8'));
  const worker=fs.readFileSync(new URL('../ai-control-worker.js',import.meta.url),'utf8');
  for(const service of catalog.services)assert.match(service.launchUrl,/^https:\/\/ekodi\.kr\/ai\//);
  assert.match(worker,/resolveExecutionServiceEntry\(url\.pathname,capabilityRegistry\)/);
  assert.match(worker,/service\.deliveryMode==='direct'/);
  assert.match(worker,/if\(paid\)\{advanced=new URL\('https:\/\/ekodi\.kr\/auth\/'\)/);
  assert.match(worker,/advanced\.searchParams\.set\('review','1'\)/);
  assert.match(worker,/advanced\.searchParams\.set\('plan','plus'\)/);
  assert.match(worker,/기본 기능 바로 사용/);
  assert.match(worker,/유료 고급 기능을 선택할 때 로그인 후 구독·결제를 안내합니다/);
  const marketing=resolveExecutionServiceEntry('/ai/marketing/',registry);
  assert.equal(marketing?.id,'make-marketing');
  assert.equal(marketing?.access?.paidAvailable,true);
  const projected=listExecutionServices(registry).flatMap(category=>category.services);
  const bible=projected.find(item=>item.id==='specialist-bible');
  assert.ok(bible?.launchUrl.endsWith('/ai/use/specialist-bible/'));
  assert.equal(resolveExecutionServiceEntry('/ai/use/specialist-bible/',registry)?.id,'specialist-bible');
  assert.equal(resolveExecutionServiceEntry('/ai/interpreter/',registry)?.deliveryMode,'direct');
  assert.equal(resolveExecutionServiceEntry('/ai/use/common-device-observe/',registry),null);
  assert.ok(projected.filter(item=>item.usableNow).every(item=>item.targetUrl));
});
