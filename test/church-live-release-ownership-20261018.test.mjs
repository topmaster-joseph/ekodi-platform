import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('protected merge deploys Church Live host capability to Control API and studio to Site Core',async()=>{
  const [script,control,site]=await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('.github/workflows/deploy-control-api.yml'),
    read('.github/workflows/deploy-site-core.yml')
  ]);
  const apiScope=script.slice(script.indexOf('const controlApiTouched='),script.indexOf('const marketingGrowthTouched='));
  const siteScope=script.slice(script.indexOf('const sharedSiteTouched='),script.indexOf('const churchPagesTouched='));
  for(const name of ['realtime-control.js','realtime-tenant-registry.js']) {
    assert.ok(apiScope.includes("'"+name+"'"),'missing Control API source '+name);
    assert.ok(control.includes("- '"+name+"'"),'missing standard Control API source '+name);
  }
  for(const name of ['tenant-live.js','tenant-live.css','tenant-live-page.js','realtime-tenant-registry.js']){
    assert.ok(siteScope.includes("'"+name+"'"),'missing Site Core source '+name);
    assert.ok(site.includes("- '"+name+"'"),'missing standard Site Core source '+name);
  }
  assert.match(script,/if\(controlApiTouched\)\{/);
  assert.match(script,/if\(sharedSiteTouched\)\{/);
  assert.match(script,/deploy-control-api\.yml\/dispatches/);
  assert.match(script,/deploy-site-core\.yml\/dispatches/);
  assert.match(script,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(script,/if\(!await verifiedCheckRuns\(headSha\)\)/);
  assert.match(script,/release receipt is not authorized/);
});

test('immediate owner-approved recovery also dispatches both independent guarded release owners',async()=>{
  const r=await read('scripts/recover-release-provenance.mjs');
  const paths=r.slice(r.indexOf('const controlApiTouched='),r.indexOf('// First-party Shell'));
  for(const name of ['realtime-control.js','realtime-tenant-registry.js']) {
    assert.ok(paths.includes("'"+name+"'"),'Control API immediate source '+name);
  }
  for(const name of ['tenant-live.js','tenant-live.css','tenant-live-page.js','realtime-tenant-registry.js']){
    assert.ok(paths.includes("'"+name+"'"),'Site Core immediate source '+name);
  }
  // Preserve the existing independently reviewed Board/Shell/Site Core guard,
  // and add a second receipt-bound API-only guard for host runtime edits.
  assert.match(r,/if\(merge\.response\.ok&&\(independentBoardTouched\|\|shellRuntimeTouched\|\|sharedSiteTouched\)\)/);
  const dispatches=r.slice(r.indexOf('if(merge.response.ok&&(independentBoardTouched'),r.indexOf('// This branch is narrowly scoped'));
  assert.match(dispatches,/merge\.data\?\.merged!==true/);
  assert.match(dispatches,/main\.data\?\.commit\?\.sha/);
  assert.match(dispatches,/if\(merge\.response\.ok&&controlApiTouched\)\{/);
  assert.match(dispatches,/deploy-control-api\.yml\/dispatches/);
  assert.match(dispatches,/if\(apiDispatch\.response\.status!==204\)/);
  assert.match(dispatches,/out\('control_api_dispatch','accepted'\)/);
  assert.match(dispatches,/if\(sharedSiteTouched\)\{/);
  assert.match(dispatches,/deploy-site-core\.yml\/dispatches/);
  assert.match(dispatches,/release_branch_ref:branchRef,release_task_id:taskId/);
});

test('public Church Live E2E is owner-gated rather than automatically triggered by Control API release',async()=>{
  const [live,src]=await Promise.all([
    read('.github/workflows/church-live-production-e2e.yml'),
    read('scripts/church-live-production-e2e.mjs')
  ]);
  // Production E2E creates a real, briefly public synthetic stream.
  // A successful deployment is not authority to start that stream.
  const triggers=live.slice(live.indexOf('\non:\n'),live.indexOf('\npermissions:'));
  assert.ok(triggers.startsWith('\non:\n'),'workflow event block missing');
  assert.match(triggers,/workflow_dispatch:/);
  assert.match(triggers,/issue_comment:/);
  assert.doesNotMatch(triggers,/^\s*(?:push|pull_request|workflow_run|schedule|repository_dispatch):/m);
  assert.match(live,/github\.event_name == 'workflow_dispatch'/);
  assert.match(live,/github\.actor == 'topmaster-joseph'/);
  assert.match(live,/inputs\.acknowledge_public_synthetic_broadcast == 'yes'/);
  assert.match(live,/github\.event_name == 'issue_comment'/);
  assert.match(live,/github\.event\.issue\.number == 5140/);
  assert.match(live,/github\.event\.comment\.user\.login == 'topmaster-joseph'/);
  assert.match(live,/github\.event\.comment\.body == '\/ekodi-church-live-e2e 2026-10-25'/);
  assert.match(live,/Revoke short-lived E2E session/);
  assert.match(src,/active_church_broadcast/);
  assert.match(src,/viewer_received_no_live_track/);
  assert.match(src,/cameraContext=await browser\.newContext/);
  assert.doesNotMatch(src,/tinyfish|browserstack|sauce.?labs/i);
});
