import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planSiteMissionAudit,runSiteMissionAudit,
  MISSION_BROWSER_PROFILES} from '../scripts/verify-ekodi-site-missions-native.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const registry=read('config/ecosystem-services.json');
const missions=read('config/ekodi-site-missions.json');
test('EKODI-owned native browser audit plans canonical, bounded, read-only mission assertions',()=>{
  const plan=planSiteMissionAudit(registry,missions);
  assert.ok(plan.eligibleIds.includes('platform'));
  assert.ok(plan.eligibleIds.includes('publishing'));
  assert.ok(plan.eligibleIds.includes('books'));
  assert.ok(plan.eligibleIds.includes('journal'));
  assert.ok(plan.deferredIds.includes('management'));
  assert.ok(plan.deferredIds.includes('cafe'));
  assert.equal(plan.externalBrowserCalls,0);
  assert.deepEqual(plan.profiles,MISSION_BROWSER_PROFILES);
  for(const job of plan.jobs){
    assert.ok(job.ids.length>=1&&job.ids.length<=5);
    assert.ok(job.actions<=30);
    assert.equal(job.assertions,job.ids.length);
    assert.equal(job.request.kind,'public-readonly');
    assert.ok(Object.values(job.request.expectedTextByPath).every(x=>x.length<=80));
    assert.ok(job.request.paths.every(x=>x.startsWith('/')));
    assert.ok(job.request.paths.every(x=>!x.includes('?')));
    assert.ok(job.request.paths.every(x=>!x.includes('://')));
  }
});
test('native browser audit cannot accidentally publish or probe planned non-live sites',()=>{
  const withPreparing=planSiteMissionAudit(registry,missions,{includePreparing:true});
  assert.ok(withPreparing.eligibleIds.includes('management'));
  assert.ok(withPreparing.eligibleIds.includes('cafe'));
  assert.ok(!withPreparing.eligibleIds.includes('edu'));
  assert.ok(withPreparing.deferredIds.includes('edu'));
  assert.ok(withPreparing.jobs.every(j=>j.actions<=30));
  const invalid=structuredClone(registry);
  invalid.services.find(x=>x.id==='publishing').url='https://evil.example/publishing/';
  assert.throws(()=>planSiteMissionAudit(invalid,missions),/NONCANONICAL_ORIGIN/);
  const renamed=structuredClone(registry);
  renamed.services.find(x=>x.id==='publishing').name='출판';
  assert.throws(()=>planSiteMissionAudit(renamed,missions),/SITE_IDENTITY_DRIFT/);
});
test('plan mode is not evidence of deployment; native fake runner reports only redacted receipts',async()=>{
  let called=0;
  const plan=await runSiteMissionAudit(registry,missions,{planOnly:true,runOptions:{
    runner:async()=>{called++;return {ok:true};}
  }});
  assert.equal(called,0);
  assert.equal(plan.mode,'plan-only');
  const good=await runSiteMissionAudit(registry,missions,{runOptions:{
    runner:async task=>{
      called++;
      assert.equal(task.allowMutation,false);
      const assertions=task.actions.filter(x=>x.type==='assertText');
      assert.ok(assertions.length>0);
      return {ok:true,virtualizationProvider:'ekodi-background-browser-worker',
        performance:{navigations:task.actions.filter(x=>x.type==='goto').length+1,
          p50Ms:110,p95Ms:240}};
    }
  }});
  assert.equal(good.ok,true);
  assert.equal(called,good.receipts.length);
  assert.ok(good.receipts.every(x=>x.provider==='ekodi-background-browser-worker'));
  assert.ok(!JSON.stringify(good).includes('missionText'));
  assert.equal(good.externalBrowserCalls,0);
});
test('refusal from native worker fails closed, without external provider fallback',async()=>{
  const denied=await runSiteMissionAudit(registry,missions,{runOptions:{
    runner:async()=>({ok:true,virtualizationProvider:'some-paid-browser'})
  }});
  assert.equal(denied.ok,false);
  assert.equal(denied.externalBrowserCalls,0);
  assert.equal(denied.completed,0);
});
