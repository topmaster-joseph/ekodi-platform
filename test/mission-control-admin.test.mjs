import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Governance Cockpit exposes five human-facing primary perspectives',async()=>{
  const source=await read('mission-control-admin.js');
  assert.doesNotThrow(()=>new Function(source));
  for(const label of ['Overview','Decisions','Ecosystem','AI Council','System']) assert.match(source,new RegExp(`label:'${label}'`));
  assert.match(source,/mission-primary-nav/);
  assert.match(source,/governance-system-open/);
  assert.doesNotMatch(source,/label:'Campus'/);
  assert.doesNotMatch(source,/label:'More'/);
});

test('Governance Cockpit centers Chief AI brief, decisions, ecosystem and AI council',async()=>{
  const source=await read('mission-control-admin.js');
  assert.match(source,/CHIEF AI BRIEF/);
  assert.match(source,/DECISION QUEUE/);
  assert.match(source,/LIVE SIGNALS/);
  assert.match(source,/AI COUNCIL/);
  assert.match(source,/ECOSYSTEM · DELEGATED OPERATIONS/);
  assert.match(source,/Chief AI Control Room/);
  for(const agent of ['Chief AI','Platform AI','Site AI','Workspace AI','Security AI','Release AI','Finance AI']) assert.match(source,new RegExp(agent));
});

test('Governance Cockpit remains observation-first and routes important choices to Chief AI',async()=>{
  const source=await read('mission-control-admin.js');
  assert.match(source,/\/api\/control\/overview/);
  assert.match(source,/\/api\/control\/check/);
  assert.match(source,/CORE_DOMAINS/);
  assert.match(source,/Chief AI에게 선택지 요청/);
  assert.match(source,/governanceCommandBar/);
  assert.match(source,/방향 설정이나 중요한 결정을 지시하세요/);
  assert.doesNotMatch(source,/fetch\([^\n]*(delete|destroy|drop|dns\/update|billing\/charge)/i);
  assert.doesNotMatch(source,/service[_-]?role/i);
});

test('Governance Cockpit is shipped securely and hydrated only after AI Ops is opened',async()=>{
  const [build,html,worker,demand,shell]=await Promise.all([read('scripts/build.mjs'),read('control-center.html'),read('site-worker.js'),read('admin-demand-loader.js'),read('admin-authenticated-shell.js')]);
  assert.match(build,/'mission-control-admin\.css'/);
  assert.match(build,/'mission-control-admin\.js'/);
  assert.doesNotMatch(html,/mission-control-admin\.(?:js|css)/);
  assert.doesNotMatch(shell,/'mission-control-admin\.js'/);
  assert.match(demand,/secondaryStyles: \['mission-control-admin\.css', 'release-control-admin\.css', 'system-health-admin\.css'\]/);
  assert.match(demand,/secondaryScripts: \['mission-control-admin\.js', 'release-control-admin\.js', 'admin-lazy-features\.js', 'system-health-admin\.js'\]/);
  assert.match(worker,/'\/mission-control-admin\.css'/);
  assert.match(worker,/'\/mission-control-admin\.js'/);
  assert.match(worker,/ADMIN_ASSETS/);
  assert.match(worker,/'admin-asset'/);
});

test('System hub preserves existing technical operations behind governance navigation',async()=>{
  const [mission,timeline,build]=await Promise.all([read('mission-control-admin.js'),read('system-timeline-admin.js'),read('scripts/build.mjs')]);
  assert.match(mission,/key:'system'/);
  assert.match(timeline,/governanceSystemHub/);
  assert.match(timeline,/key:'operations', label:'Operations'/);
  assert.match(timeline,/raw === 'campus'/);
  assert.match(timeline,/#overview/);
  assert.match(timeline,/#system/);
  assert.match(build,/system-timeline-admin\.js/);
  assert.match(build,/system-timeline-admin\.css/);
});

test('Governance Cockpit keeps existing AI Ops and Chief AI contracts instead of duplicating privileged control',async()=>{
  const [mission,aiOps,lazy]=await Promise.all([read('mission-control-admin.js'),read('ai-ops-admin.js'),read('admin-lazy-features.js')]);
  assert.match(mission,/routeSection\('aiops'\)/);
  assert.match(aiOps,/Decision Gate/);
  assert.match(aiOps,/SITE FLEET/);
  assert.match(lazy,/CHIEF AI CONVERSATION/);
  assert.match(lazy,/installChiefChat/);
});

test('Governance production workflow verifies new cockpit markers',async()=>{
  const workflow=await read('.github/workflows/deploy-admin-ai-ops.yml');
  assert.match(workflow,/mission-control-admin\.js/);
  assert.match(workflow,/mission-control-admin\.css/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/shared-site\.worker\.json/);
  assert.match(workflow,/Verify production Admin Governance Cockpit boundary/);
  assert.match(workflow,/DECISION QUEUE/);
  assert.match(workflow,/AI COUNCIL/);
});
