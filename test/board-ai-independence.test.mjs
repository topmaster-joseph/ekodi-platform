import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBoardAdapter,BOARD_ADAPTER_OPERATIONS} from '../common-board-adapter.js';
import {createBoardRuntimeGuard,BOARD_CORE_OPERATIONS} from '../board-runtime-guard.js';

test('board contract includes search and all critical operations',()=>{
  for(const operation of ['list','read','search','create','reply','edit','delete','moderate','attachments','health','consume']){
    assert.ok(BOARD_ADAPTER_OPERATIONS.includes(operation),operation);
    assert.ok(BOARD_CORE_OPERATIONS.includes(operation),operation);
  }
});

test('runtime guard always serves core operations from EKODI adapter',async()=>{
  let extensionCalls=0;
  const adapter=createBoardAdapter({
    boardId:'ai.independent.test',
    list:()=>new Response('native-list'),
    search:()=>new Response('native-search'),
    create:()=>new Response('native-create')
  });
  const extension={
    list:()=>{extensionCalls+=1;throw new Error('ai_or_provider_down')},
    search:()=>{extensionCalls+=1;throw new Error('ai_or_provider_down')},
    create:()=>{extensionCalls+=1;throw new Error('ai_or_provider_down')}
  };
  const runtime=createBoardRuntimeGuard({adapter,extension,extensionId:'external'});
  assert.equal(runtime.aiIndependent,true);
  assert.equal(runtime.coreSource,'ekodi-board-adapter');
  assert.equal(await (await runtime.list()).text(),'native-list');
  assert.equal(await (await runtime.search()).text(),'native-search');
  assert.equal(await (await runtime.create()).text(),'native-create');
  assert.equal(extensionCalls,0);
});

test('board resilience policy forbids synchronous AI dependency',()=>{
  const policy=JSON.parse(fs.readFileSync(new URL('../config/replaceable-board-engine-policy.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
  assert.equal(policy.status,'enforced');
  assert.equal(policy.appliesRecursivelyToAllServices,true);
  assert.equal(policy.architecture.coreRuntimeGuardRequired,true);
  assert.equal(policy.architecture.coreOperationsAlwaysUseEkodiAdapter,true);
  assert.equal(policy.architecture.aiSynchronousDependencyForbidden,true);
  assert.equal(policy.architecture.aiFailureMustNotAffectCoreBoard,true);
  assert.equal(policy.aiIndependence.criticalPathAiDependency,'forbidden');
  assert.equal(policy.aiIndependence.synchronousAiProviderCalls,'forbidden');
});


test('all registered existing board surfaces remain AI-independent on their core path',()=>{
  const policy=JSON.parse(fs.readFileSync(new URL('../config/replaceable-board-engine-policy.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
  const surfaces=new Map((policy.verifiedIndependentSurfaces||[]).map(item=>[item.id,item]));
  for(const id of ['seonammedi.citizen_voice','seonammedi.notice','journal.posts','organization.notices','community'])assert.ok(surfaces.has(id),id);

  const admin=fs.readFileSync(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8');
  assert.match(admin,/boardId:'seonammedi\.notice'/);
  assert.match(admin,/createBoardRuntimeGuard\(\{adapter:seonamNoticeAdapter\}\)/);
  for(const action of ['list','read','search','create','edit','delete','attachments','health'])assert.match(admin,new RegExp("handleBoardAdapter\\(seonamNoticeBoard,\\{action:'"+action+"'"));

  const journal=fs.readFileSync(new URL('../journal-worker.js',import.meta.url),'utf8');
  assert.doesNotMatch(journal,/api\.openai\.com|anthropic|generativelanguage\.googleapis\.com|workers[_-]?ai/i);

  const organization=fs.readFileSync(new URL('../supabase/migrations/20260914095000_organization_subsite_operations.sql',import.meta.url),'utf8');
  assert.match(organization,/organization_notices/);
  assert.doesNotMatch(organization,/openai|anthropic|gemini|llm/i);

  const community=fs.readFileSync(new URL('../supabase/functions/community-api/index.ts',import.meta.url),'utf8');
  assert.match(community,/if \(!OPENAI_API_KEY \|\| !OPENAI_MODEL\) return fallback/);
  assert.match(community,/if \(!response\.ok\) return fallback/);
  assert.match(community,/community draft provider/);
  assert.match(community,/return fallback/);
});
