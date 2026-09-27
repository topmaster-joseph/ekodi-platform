import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const json=path=>JSON.parse(read(path));

test('all canonical workspace sites inherit one recursive execution policy',()=>{
  const policy=json('config/site-execution-enforcement.json');
  const registry=json('config/site-lifecycle-registry.json');
  assert.equal(policy.status,'enforced');
  assert.equal(policy.scope.futureSitesAutoInherit,true);
  assert.equal(policy.scope.perSiteOptOutAllowed,false);
  assert.equal(policy.scope.allDescendantServicePaths,true);
  assert.equal(policy.scope.siteOwnedAdmin,true);
  assert.equal(policy.inheritance.mode,'mandatory-recursive');
  assert.equal(registry.enforcement.policy,'config/site-execution-enforcement.json');
  const pending=new Set(policy.exceptions.pendingCanonicalStates);
  const canonical=registry.existingWorkspaceSites.filter(site=>site.class==='workspace_user_site'&&site.canonicalUrl);
  assert.ok(canonical.length>=8);
  for(const site of registry.existingWorkspaceSites.filter(site=>site.class==='workspace_user_site')){
    assert.notEqual(site.enforcementOptOut,true,site.id);
    if(site.canonicalUrl)assert.ok(site.canonicalUrl.startsWith('https://ekodi.kr/'),site.id);
    else assert.ok(pending.has(site.migrationState),site.id);
  }
});

test('descendant service and admin addressing stay under the site root',()=>{
  const policy=json('config/site-execution-enforcement.json');
  const registry=json('config/site-lifecycle-registry.json');
  assert.equal(registry.workspaceServicePolicy.canonicalPattern,'https://ekodi.kr/{slug}/{service}');
  assert.equal(policy.canonicalAddressing.descendantPattern,'https://ekodi.kr/{slug}/{service}');
  assert.equal(policy.canonicalAddressing.adminPattern,'https://ekodi.kr/{slug}/admin');
  assert.equal(policy.canonicalAddressing.featureSubdomainCreationForbidden,true);
});

test('three daily site-improvement windows preserve cumulative usage ceilings and reserve',()=>{
  const policy=json('config/site-execution-enforcement.json');
  const budget=policy.continuousImprovement.dailyBudget;
  assert.equal(budget.resetTimeKst,'09:00');
  assert.equal(budget.timezone,'Asia/Seoul');
  assert.equal(budget.executionCountPerBudgetDay,3);
  assert.deepEqual(budget.cumulativeCeilingsPercent,{morning:30,lunch:60,evening:90});
  assert.equal(budget.emergencyReservePercent,10);
  assert.equal(budget.cumulativeNotPerRun,true);
  assert.equal(budget.futureSlotBudgetBorrowingForbidden,true);
  assert.equal(policy.continuousImprovement.rootAndDescendantsShareOneExecutionBudget,true);
  assert.equal(policy.continuousImprovement.slotExecutionMustRemainLowTrafficGated,true);
});

test('continuous site improvement is bound to the same recursive policy',()=>{
  const scheduler=read('ekodi-site-improvement-scheduler.js');
  assert.match(scheduler,/site-execution-enforcement\.json/);
  assert.match(scheduler,/Mandatory recursive site execution policy/);
  assert.match(scheduler,/every discoverable same-site subservice and site-owned admin surface/);
  assert.match(scheduler,/child surfaces may tighten but must not relax/);
});
