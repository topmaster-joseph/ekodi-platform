import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Governance Cockpit remains available as a separate technical asset',async()=>{
  const source=await read('mission-control-admin.js');
  assert.doesNotThrow(()=>new Function(source));
  for(const label of ['Overview','Decisions','Ecosystem','AI Council','System']) assert.match(source,new RegExp(`label:'${label}'`));
  assert.match(source,/mission-primary-nav/);
  assert.match(source,/governance-system-open/);
});

test('Governance technical asset keeps decision and council information without owning primary AI Ops',async()=>{
  const source=await read('mission-control-admin.js');
  assert.match(source,/CHIEF AI BRIEF/);
  assert.match(source,/DECISION QUEUE/);
  assert.match(source,/AI COUNCIL/);
  assert.match(source,/Chief AI Control Room/);
  assert.match(source,/\/api\/control\/overview/);
  assert.match(source,/\/api\/control\/check/);
  assert.doesNotMatch(source,/fetch\([^\n]*(delete|destroy|drop|dns\/update|billing\/charge)/i);
  assert.doesNotMatch(source,/service[_-]?role/i);
});

test('Primary AI Ops does not auto-hydrate Governance, Health or Deployments',async()=>{
  const [build,html,worker,demand,shell]=await Promise.all([
    read('scripts/build.mjs'),read('admin-shell.html'),read('site-worker.js'),read('admin-demand-loader.js'),read('admin-authenticated-shell.js')
  ]);
  assert.match(build,/'mission-control-admin\.css'/);
  assert.match(build,/'mission-control-admin\.js'/);
  assert.doesNotMatch(html,/mission-control-admin\.(?:js|css)/);
  assert.doesNotMatch(shell,/'mission-control-admin\.js'/);
  const aiops=demand.match(/aiops:\s*\{([\s\S]*?)\n\s*\},\n\s*health:/)?.[1] || '';
  assert.match(aiops,/secondaryScripts: \['admin-lazy-features\.js'\]/);
  assert.doesNotMatch(aiops,/system-health-admin|mission-control-admin|release-control-admin/);
  assert.match(demand,/health:\s*\{/);
  assert.match(demand,/styles: \['system-health-admin\.css'\]/);
  assert.match(demand,/scripts: \['system-health-admin\.js'\]/);
  assert.match(demand,/hashes: \['#health'\]/);
  assert.match(demand,/deployments:\s*\{/);
  assert.match(demand,/scripts: \['release-control-admin\.js'\]/);
  assert.match(worker,/'\/mission-control-admin\.css'/);
  assert.match(worker,/'\/mission-control-admin\.js'/);
  assert.match(worker,/ADMIN_ASSETS/);
  assert.match(worker,/'admin-asset'/);
});

test('System timeline remains available inside the separate Deployments technical surface',async()=>{
  const [mission,timeline,build]=await Promise.all([read('mission-control-admin.js'),read('system-timeline-admin.js'),read('scripts/build.mjs')]);
  assert.match(mission,/key:'system'/);
  assert.match(timeline,/root\.id = 'systemTimeline'/);
  assert.match(timeline,/document\.querySelector\('#releaseControl'\)/);
  assert.match(timeline,/OPERATIONS BLACK BOX/);
  assert.match(build,/system-timeline-admin\.js/);
  assert.match(build,/system-timeline-admin\.css/);
});

test('Flat AI Ops keeps decision safety while current conversation owns normal requests',async()=>{
  const [aiOps,lazy,patch]=await Promise.all([read('ai-ops-admin.js'),read('admin-lazy-features.js'),read('admin-readable-command.js')]);
  assert.match(aiOps,/Decision Gate/);
  assert.match(aiOps,/SITE FLEET/);
  assert.match(lazy,/CHIEF AI CONVERSATION/);
  assert.match(lazy,/installChiefChat/);
  assert.match(patch,/ROLE_HANDOFF_RE/);
  assert.match(patch,/전문 기능 선택을 관리자에게 넘기지 않습니다/);
  assert.match(patch,/actionType:'ui\.change_request'/);
});

test('AI Ops production workflow verifies the canonical shared-site release instead of deploying it twice',async()=>{
  const workflow=await read('.github/workflows/deploy-admin-ai-ops.yml');
  assert.match(workflow,/admin-readable-command\.js/);
  assert.match(workflow,/admin-readable-command\.css/);
  assert.match(workflow,/sec: \['admin-lazy-features\.js'\]/);
  assert.match(workflow,/health:/);
  assert.match(workflow,/system-health-admin\.js/);
  assert.match(workflow,/actionType:'ui\.change_request'/);
  assert.match(workflow,/workflows: \['Deploy EKODI Shared Site Core'\]/);
  assert.match(workflow,/Verify production fingerprinted thin shell and flat AI Ops/);
  assert.match(workflow,/admin-shell\.html/);
  assert.match(workflow,/admin-compact\.css/);
  assert.match(workflow,/x-ekodi-route: admin-shell/);
  assert.match(workflow,/ai-ops-admin\.css/);
  assert.match(workflow,/max-age=31536000, immutable/);
  assert.doesNotMatch(workflow,/guarded-worker-release\.mjs/);
  assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow,/Verify production Admin Governance Cockpit boundary/);
});