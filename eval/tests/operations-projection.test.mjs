import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {queryOperationalSnapshot, unresolvedEvaluationSnapshot} from '../operations-projection.mjs';
import {OPS_BASELINE_SQL} from '../ops-baseline.mjs';

const source=name=>readFileSync(fileURLToPath(new URL('../../'+name,import.meta.url)),'utf8');
const example={
  providers:[{provider_id:'cloudflare-workers-ai',tries:50,ok:45,failed:5},{provider_id:'tenant-user@secret.com',tries:100,ok:95,failed:5}],
  days:[{day:'2026-11-01',tries:50,ok:45}],
  states:[{state:'completed',older7d:6,last7d:15},{state:'assigned',older7d:3,last7d:5}],
};
function db(rows=example){
  const calls=[];
  return {calls,prepare(sql){
    calls.push(sql);
    const data=sql===OPS_BASELINE_SQL.providerOverall?rows.providers:sql===OPS_BASELINE_SQL.routingDaily?rows.days:sql===OPS_BASELINE_SQL.orchestratorStates?rows.states:null;
    assert(data!==null,'Unexpected D1 SQL');
    return {bind(...args){calls.push(args);return this;},async all(){return {results:data}}};
  }};
}
test('private operational snapshot uses only D1 aggregate queries',async()=>{
  const fake=db();
  const measured=await queryOperationalSnapshot(fake,'2026-11-03T00:00:00.000Z');
  assert.equal(measured.source,'cloudflare-d1-aggregate');
  assert.equal(measured.providers.length,1);
  assert.equal(measured.providers[0].provider,'cloudflare-workers-ai');
  assert.equal(measured.providers[0].attempted,50);
  assert.equal(measured.providers[0].selected,45);
  assert.equal(measured.orchestrator.assignedOlderThan7Days,3);
  assert.equal(measured.orchestrator.completionLast7d.estimate,0.75);
  assert.equal(measured.routingDays.length,1);
  assert(!JSON.stringify(measured).includes('tenant-user@secret.com'));
  assert.equal(fake.calls.filter(x=>typeof x==='string').length,3);
  assert(!fake.calls.some(x=>typeof x==='string'&&/SELECT.*prompt|SELECT.*payload/i.test(x)));
});
test('no operational evidence is silently promoted to AI eval scores',async()=>{
  const measured=await queryOperationalSnapshot(db());
  const report=unresolvedEvaluationSnapshot(measured);
  assert.equal(report.status,'needs-goldens-and-calibration');
  assert.equal(report.verifiedAt,null);
  assert.equal(report.sampleCount,0);
  assert.equal(report.repeatCount,0);
  assert.deepEqual(report.rows,[]);
  assert.equal(report.requirements.privateHoldoutRequired,true);
});
test('missing D1 and missing source tables fail closed',async()=>{
  await assert.rejects(queryOperationalSnapshot(null),/D1_REQUIRED/);
  await assert.rejects(queryOperationalSnapshot({prepare(){throw Error('no table')}}),/no table/);
});
test('central route must use server authorization and appear before generic AI controller',()=>{
  const control=source('ai-eval-control.js'),mission=source('mission-control-entry-worker.js');
  assert.match(control,/authWorker\.fetch/);
  assert.match(control,/session\?\.authenticated!==true/);
  assert.match(control,/session\?\.role!=='super_admin'/);
  assert.match(control,/AUTH_REQUIRED.*401/);
  assert.match(control,/SUPER_ADMIN_REQUIRED.*403/);
  assert.doesNotMatch(control,/UPDATE |INSERT |DELETE /i);
  assert(mission.indexOf("path === '/api/control/ai/eval/summary'")<mission.indexOf("path.startsWith('/api/control/ai/')"));
});
test('admin renders operational observations separately from verified scores',()=>{
  const ui=source('ai-eval-admin.js');
  assert.match(ui,/운영 관측 · 모델 품질 점수가 아닙니다/);
  assert.match(ui,/function renderOperational/);
  assert.match(ui,/if\(!valid\(data\)\)\{renderOperational\(data\);return\}/);
  assert.match(ui,/data\?\.status==='verified'/);
});
