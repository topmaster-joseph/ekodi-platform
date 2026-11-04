import test from 'node:test';
import assert from 'node:assert/strict';
import {planNativeBrowserBatch,runNativeBrowserBatch} from '../scripts/ekodi-native-browser-batch.mjs';

test('native batch deduplicates canonical surfaces and uses exactly one Chromium launch',()=>{
  const plan=planNativeBrowserBatch({taskId:'mall canary',paths:['/','/ekodimall/','/','/admin/'],screenshots:true});
  assert.equal(plan.uniquePaths,3);
  assert.equal(plan.requestedPaths,4);
  assert.equal(plan.chromiumLaunches,1);
  assert.equal(plan.externalBrowserCalls,0);
  assert.equal(plan.task.allowMutation,false);
  assert.equal(plan.task.taskId,'mall_canary');
  assert.deepEqual(plan.task.actions.map(a=>a.type),['snapshot','screenshot','goto','snapshot','screenshot','goto','snapshot','screenshot']);
});

test('native batch budgets at most 30 actions while retaining all 12 snapshots',()=>{
  const paths=Array.from({length:12},(_,i)=>'/journal/article/'+i);
  const plan=planNativeBrowserBatch({paths,screenshots:true,deviceProfile:'mobile-portrait'});
  assert.equal(plan.task.actions.length,30);
  assert.equal(plan.screenshotsPlanned,7);
  assert.equal(plan.task.actions.filter(a=>a.type==='snapshot').length,12);
  assert.equal(plan.task.actions.filter(a=>a.type==='goto').length,11);
  assert.equal(plan.task.actions.filter(a=>a.type==='screenshot').length,7);
});

test('native batch rejects external domains, JavaScript, mutation and unbounded paths',()=>{
  for(const v of ['https://evil.example/','javascript:alert(1)','//evil.example','https://ekodi.kr.evil.example/'])
    assert.throws(()=>planNativeBrowserBatch({paths:[v]}),/canonical ekodi\.kr|NATIVE_BATCH/);
  assert.throws(()=>planNativeBrowserBatch({paths:[]}),/NATIVE_BATCH_PATH_COUNT/);
  assert.throws(()=>planNativeBrowserBatch({paths:Array.from({length:13},()=>'/')}),/NATIVE_BATCH_PATH_COUNT/);
  assert.throws(()=>planNativeBrowserBatch({paths:['/'],allowMutation:true}),/MUTATION_FORBIDDEN/);
  assert.throws(()=>planNativeBrowserBatch({paths:['/'],deviceProfile:'unknown'}),/Unsupported device profile/);
});

test('batch runner rejects unverified provider result, otherwise records one launch',async()=>{
  const request={paths:['/','/admin/']};
  let calls=0;
  const good=await runNativeBrowserBatch(request,{runner:async task=>{
    calls++;
    assert.equal(task.actions.filter(x=>x.type==='goto').length,1);
    return {ok:true,virtualizationProvider:'ekodi-background-browser-worker',performance:{navigations:2,p50Ms:120,p95Ms:210}};
  }});
  assert.equal(calls,1);
  assert.equal(good.externalBrowserCalls,0);
  assert.equal(good.chromiumLaunches,1);
  assert.equal(good.performance.p95Ms,210);
  await assert.rejects(runNativeBrowserBatch(request,{runner:async()=>({ok:true,virtualizationProvider:'external'})}),/NOT_VERIFIED/);
});
