import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CANARY_PROFILES,CANARY_SITES,planPublicMissionCanary,
  runPublicMissionCanary} from '../scripts/verify-ekodi-site-mission-canary.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registry=JSON.parse(read('config/ecosystem-services.json'));
const missions=JSON.parse(read('config/ekodi-site-missions.json'));
const sources=Object.fromEntries(CANARY_SITES.map(s=>[s.id,read(s.source)]));

test('native public mission canary plans exact current canonical owned Biz/Mall routes at four real viewports',()=>{
  const plan=planPublicMissionCanary(registry,missions,sources);
  assert.deepEqual(plan.paths,['/ekodibiz/','/ekodimall/']);
  assert.deepEqual(plan.requests.map(r=>r.deviceProfile),CANARY_PROFILES);
  assert.deepEqual(plan.requests.map(r=>r.kind),CANARY_PROFILES.map(()=>'public-readonly'));
  assert.equal(plan.externalBrowserCalls,0);
  for(const r of plan.requests){
    assert.equal(r.allowMutation,undefined);
    assert.equal(r.screenshots,true);
    assert.ok(r.expectedTextByPath['/ekodibiz/'].includes('integrity'));
    assert.ok(r.expectedTextByPath['/ekodimall/'].startsWith('우리는 물건을'));
    assert.ok(!JSON.stringify(r).includes('cookie'));
    assert.ok(!JSON.stringify(r).includes('token'));
  }
  assert.equal(plan.requests.length,4);
});

test('canonical source and business controls must exist before a single browser launch',()=>{
  const broken=structuredClone(sources);
  broken.biz=broken.biz.replace('data-ekodi-mission="biz"','data-ekodi-mission="absent"');
  assert.throws(()=>planPublicMissionCanary(registry,missions,broken),/SOURCE_DRIFT/);
  broken.biz=sources.biz;
  broken.mall=broken.mall.replace('id="contextForm"','id="missingForm"');
  assert.throws(()=>planPublicMissionCanary(registry,missions,broken),/MALL_SEARCH_CONTROL/);
  const unowned=structuredClone(registry);
  unowned.services.find(x=>x.id==='mall').status='preparing';
  assert.throws(()=>planPublicMissionCanary(unowned,missions,sources),/SITE_NOT_LIVE_OR_UNOWNED/);
  const outside=structuredClone(registry);
  outside.services.find(x=>x.id==='biz').url='https://elsewhere.example/ekodibiz';
  assert.throws(()=>planPublicMissionCanary(outside,missions,sources),/ORIGIN_OR_ROUTE_INVALID/);
});

test('plan-only is explicitly not production verification',async()=>{
  let called=0;
  const r=await runPublicMissionCanary(registry,missions,sources,{
    planOnly:true,runner:async()=>{called++;return {ok:true};}
  });
  assert.equal(called,0);
  assert.equal(r.mode,'plan-only');
  assert.equal(r.plannedRuns,4);
  assert.equal(r.plannedDOMAssertions,8);
  assert.equal(r.externalBrowserCalls,0);
});

test('native verified worker emits only a sanitized result; no third-party fallback',async()=>{
  let called=0;
  const success=await runPublicMissionCanary(registry,missions,sources,{
    runner:async task=>{
      called++;
      assert.equal(task.allowMutation,false);
      assert.deepEqual(task.actions.map(x=>x.type),
        ['snapshot','assertText','screenshot','goto','snapshot','assertText','screenshot']);
      return {ok:true,virtualizationProvider:'ekodi-background-browser-worker',
        performance:{navigations:2,p50Ms:80,p95Ms:200}};
    }
  });
  assert.equal(called,4);
  assert.equal(success.ok,true);
  assert.equal(success.receipts.length,4);
  assert.equal(success.externalBrowserCalls,0);
  assert.doesNotMatch(JSON.stringify(success),/bodyText|storageState|user@example/);
  const denied=await runPublicMissionCanary(registry,missions,sources,{
    runner:async()=>({ok:true,virtualizationProvider:'some-external-paid-browser'})
  });
  assert.equal(denied.ok,false);
  assert.equal(denied.failedProfile,'compact-mobile');
  assert.equal(denied.externalBrowserCalls,0);
});
