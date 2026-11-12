import test from 'node:test';
import assert from 'node:assert/strict';
import {planNativeBrowserBatch,runNativeBrowserBatch} from '../scripts/ekodi-native-browser-batch.mjs';
import {planEkodiIndependentBrowser,executeEkodiIndependentBrowser} from '../scripts/ekodi-independent-browser.mjs';

test('EKODI public brand audit asserts exact identity in native DOM for each canonical route',()=>{
  const request={kind:'public-readonly',taskId:'brand proof',paths:['/books/','/publishing/','/management/'],
    expectedTextByPath:{'/books/':'에코디서점','/publishing/':'에코디출판','/management/':'에코디경영'},
    screenshots:true,deviceProfile:'mobile-portrait'};
  const plan=planEkodiIndependentBrowser(request,{nativeAgentReady:false,cloudRuntimeReady:true});
  assert.equal(plan.ok,true);
  assert.equal(plan.provider,'ekodi-background-browser-worker');
  assert.equal(plan.externalBrowserCalls,0);
  assert.equal(plan.plan.assertionsPlanned,3);
  assert.equal(plan.plan.chromiumLaunches,1);
  assert.deepEqual(plan.plan.task.actions.map(a=>a.type),[
    'snapshot','assertText','screenshot','goto','snapshot','assertText','screenshot',
    'goto','snapshot','assertText','screenshot'
  ]);
  assert.deepEqual(plan.plan.task.actions.filter(a=>a.type==='assertText').map(a=>a.text),
    ['에코디서점','에코디출판','에코디경영']);
});
test('audit never silently drops mandatory assertions when screenshot/action budget is exhausted',()=>{
  const paths=Array.from({length:10},(_,i)=>'/publishing/'+i+'/');
  const expectedTextByPath=Object.fromEntries(paths.map(p=>[p,'에코디출판']));
  const plan=planNativeBrowserBatch({paths,expectedTextByPath,screenshots:true});
  assert.equal(plan.assertionsPlanned,10);
  assert.equal(plan.task.actions.length,30);
  assert.equal(plan.screenshotsPlanned,1);
  assert.equal(plan.task.actions.filter(a=>a.type==='assertText').length,10);
  const more=Array.from({length:11},(_,i)=>'/publishing/'+i+'/');
  assert.throws(()=>planNativeBrowserBatch({
    paths:more,expectedTextByPath:Object.fromEntries(more.map(p=>[p,'에코디출판']))
  }),/NATIVE_BATCH_ACTION_BUDGET_EXCEEDED/);
});
test('fail closed for private/unrequested paths, private textual probes and unsafe origins',()=>{
  for(const data of [
    {paths:['/publishing/'],expectedTextByPath:{'/books/':'에코디서점'}},
    {paths:['/publishing/'],expectedTextByPath:{'https://ekodi.kr/publishing/':'에코디출판'}},
    {paths:['/publishing/'],expectedTextByPath:{'/publishing/':'user@example.com'}},
    {paths:['/publishing/'],expectedTextByPath:{'/publishing/':'token=private'}},
    {paths:['/publishing/'],expectedTextByPath:{'/publishing/':'에코디출판\nSECRET'}},
    {paths:['/publishing/'],expectedTextByPath:['에코디출판']},
    {paths:['https://evil.example/'],expectedTextByPath:{'/publishing/':'에코디출판'}}
  ]) assert.throws(()=>planNativeBrowserBatch(data));
  assert.equal(planEkodiIndependentBrowser({
    path:'/publishing/',expectedTextByPath:{'/publishing/':'password=secret'}
  }).code,'EKODI_BROWSER_TASK_VALIDATION_FAILED');
});
test('real worker execution contract receives required assertions and never falls back',async()=>{
  const request={kind:'public-readonly',paths:['/publishing/','/books/'],
    expectedTextByPath:{'/publishing/':'에코디출판','/books/':'에코디서점'}};
  let invoked=0;
  const result=await executeEkodiIndependentBrowser(request,{cloudRuntimeReady:true},{
    runner:async task=>{
      invoked++;
      assert.deepEqual(task.actions.map(x=>x.type),
        ['snapshot','assertText','goto','snapshot','assertText']);
      assert.deepEqual(task.actions.filter(x=>x.type==='assertText').map(x=>x.text),
        ['에코디출판','에코디서점']);
      return {ok:true,virtualizationProvider:'ekodi-background-browser-worker',
        performance:{navigations:2,p50Ms:100,p95Ms:170}};
    }
  });
  assert.equal(invoked,1);
  assert.equal(result.ok,true);
  assert.equal(result.receipt.assertionsPlanned,2);
  assert.equal(result.externalBrowserCalls,0);
  const failed=await executeEkodiIndependentBrowser(request,{cloudRuntimeReady:true},{
    runner:async()=>({ok:false,virtualizationProvider:'ekodi-background-browser-worker'})
  });
  assert.equal(failed.code,'EKODI_NATIVE_BROWSER_EXECUTION_FAILED');
});
