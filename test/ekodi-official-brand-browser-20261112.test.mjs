import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planOfficialBrandAudit,runOfficialBrandAudit,
  OFFICIAL_BRAND_AUDIT_PROFILES} from '../scripts/verify-ekodi-official-brands-native.mjs';
const manifest=JSON.parse(readFileSync(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));
const aligned=structuredClone(manifest);
for(const [id,name] of [['publishing','에코디출판'],['books','에코디서점'],['management','에코디경영']])
  aligned.services.find(x=>x.id===id).name=name;

test('official EKODI audit plans 4 viewports and only published customer-facing brands by default',()=>{
  const plan=planOfficialBrandAudit(manifest);
  assert.deepEqual(plan.siteIds,['publishing','books']);
  assert.deepEqual(plan.paths,['/publishing/','/books/']);
  assert.equal(plan.expectedTextByPath['/publishing/'],'에코디출판');
  assert.equal(plan.expectedTextByPath['/books/'],'에코디서점');
  assert.deepEqual(plan.jobs.map(j=>j.profile),OFFICIAL_BRAND_AUDIT_PROFILES);
  assert.ok(plan.jobs.every(j=>j.assertions===2&&j.screenshots===2));
  assert.equal(plan.externalBrowserCalls,0);
});
test('management preparing status requires explicit inclusion and cannot be promoted by browser checks',async()=>{
  const defaultPlan=await runOfficialBrandAudit(manifest,{planOnly:true});
  assert.equal(defaultPlan.mode,'plan-only');
  assert.equal(defaultPlan.siteIds.includes('management'),false);
  const withManagement=planOfficialBrandAudit(manifest,{includePreparing:true});
  assert.equal(withManagement.siteIds.includes('management'),true);
  assert.equal(withManagement.expectedTextByPath['/management/'],'에코디경영');
  assert.equal(manifest.services.find(x=>x.id==='management').status,'preparing');
});
test('native runtime reports only sanitized bounded summaries and fails closed on an unverified worker',async()=>{
  let calls=0;
  const r=await runOfficialBrandAudit(aligned,{runOptions:{runner:async task=>{
    calls++;
    assert.equal(task.allowMutation,false);
    assert.equal(task.actions.filter(x=>x.type==='assertText').length,2);
    return {ok:true,virtualizationProvider:'ekodi-background-browser-worker',
      performance:{navigations:2,p50Ms:95,p95Ms:220}};
  }}});
  assert.equal(calls,4);
  assert.equal(r.ok,true);
  assert.equal(r.receipts.length,4);
  assert.ok(r.receipts.every(x=>x.externalBrowserCalls===0&&x.assertions===2));
  assert.ok(!JSON.stringify(r).includes('bodyText'));
  const bad=await runOfficialBrandAudit(aligned,{runOptions:{runner:async()=>{
    return {ok:true,virtualizationProvider:'external-browser'};
  }}});
  assert.equal(bad.ok,false);
  assert.equal(bad.code,'EKODI_NATIVE_BROWSER_EXECUTION_FAILED');
  assert.equal(bad.externalBrowserCalls,0);
});
test('site branding audit refuses noncanonical host or removed official ownership',()=>{
  const mal=structuredClone(manifest);
  mal.services.find(x=>x.id==='publishing').url='https://other.example/publishing/';
  assert.throws(()=>planOfficialBrandAudit(mal),/EKODI_BRAND_REGISTRY_UNSAFE/);
  const stale=structuredClone(aligned);
  stale.services.find(x=>x.id==='publishing').name='출판';
  const plan=planOfficialBrandAudit(stale);
  assert.equal(plan.sourceAligned,false);
  assert.deepEqual(plan.sourcePendingIds,['publishing']);
  assert.equal(plan.expectedTextByPath['/publishing/'],'에코디출판');
});

test('unmigrated first-party registry fails closed before any public browser invocation',async()=>{
  const stale=structuredClone(aligned);
  stale.services.find(x=>x.id==='publishing').name='출판';
  let calls=0;
  const result=await runOfficialBrandAudit(stale,{runOptions:{runner:async()=>{calls++;return {ok:true,virtualizationProvider:'ekodi-background-browser-worker'}}}});
  assert.equal(calls,0);
  assert.equal(result.ok,false);
  assert.equal(result.code,'EKODI_BRAND_SOURCE_NOT_ALIGNED');
  assert.deepEqual(result.sourcePendingIds,['publishing']);
  assert.equal(result.externalBrowserCalls,0);
});
