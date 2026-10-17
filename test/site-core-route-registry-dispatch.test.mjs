import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const convergence=read('scripts/converge-orchestrated-pr-merge.mjs');
const siteWorkflow=read('.github/workflows/deploy-site-core.yml');
const routes=read('platform-route-registry.js');
const manifest=JSON.parse(read('deploy/manifests/shared-site.worker.json'));

test('Research release uses the existing orchestrator guarded Site Core manifest trigger',()=>{
 const start=convergence.indexOf('const sharedSiteTouched=');
 const end=convergence.indexOf('const churchPagesTouched=',start);
 assert.ok(start>=0&&end>start,'protected shared Site Core dispatch predicate must exist');
 const dispatchScope=convergence.slice(start,end);
 assert.ok(dispatchScope.includes("file==='deploy/manifests/shared-site.worker.json'"),'guarded release must dispatch on manifest changes');
 assert.ok(siteWorkflow.includes("- 'deploy/manifests/shared-site.worker.json'"),'direct push fallback must also be guarded');
 assert.ok(convergence.includes("if(sharedSiteTouched){"),'Site Core dispatch must not bypass its source owner guard');
 assert.ok(convergence.includes('release_branch_ref:branch,release_task_id:taskId'),'official orchestrator receipt stays mandatory');
});

test('Research canonical route has protected candidate and production verification',()=>{
 assert.ok(routes.includes("prefix:'/research',binding:'EDUCATION',preservePrefix:true"));
 for(const [url,fragments] of [
  ['https://ekodi.kr/research/',['EKODI Research','id="diagnosisForm"','id="projectForm"']],
  ['https://ekodi.kr/research/health',['"service":"ekodi-research"','"privateDocuments":false']]
 ]){
  const canary=manifest.worker.requests.find(row=>row.url===url);
  assert.ok(canary,'missing Site Core candidate verification for '+url);
  assert.deepEqual(canary.statuses,[200]);
  assert.ok(fragments.every(x=>canary.expect.includes(x)),'expected real Research feature markers');
 }
});

test('Research has dedicated native desktop and mobile verification without taking board slots',()=>{
 for(const [name,device] of [
  ['native_research_verification_desktop','desktop'],
  ['native_research_verification_mobile','mobile-portrait']
 ]){
  const index=siteWorkflow.indexOf('  '+name+':');
  assert.ok(index>=0,'missing Research native job '+name);
  const segment=siteWorkflow.slice(index,siteWorkflow.indexOf('\n\n',index));
  assert.ok(segment.includes('needs: deploy'));
  assert.ok(segment.includes('ekodi-background-browser-worker.yml'));
  assert.ok(segment.includes('surface_paths: /research/'));
  assert.ok(segment.includes('device_profile: '+device));
 }
});
