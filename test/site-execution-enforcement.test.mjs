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
  const liveVerifier=read('scripts/verify-mobile-fixed-headers-live.mjs');
  assert.ok(canonical.length>=8);
  assert.match(liveVerifier,/PUBLIC_HEADER_FORBIDDEN/);
  for(const label of policy.publicHeader.forbiddenLabels)assert.ok(liveVerifier.includes(label),label);
  for(const site of canonical)assert.ok(liveVerifier.includes(site.canonicalUrl.replace(/\/+$/,'')),site.id);
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
  assert.equal(budget.basis,'live-server-resource-load');
  assert.equal(budget.apiUsageExcluded,true);
  assert.deepEqual(budget.serverLoadCeilingsPercent,{morning:30,lunch:60,evening:90});
  assert.equal(budget.emergencyReservePercent,10);
  assert.equal(budget.startBlockedAtOrAboveCeiling,true);
  assert.equal(policy.continuousImprovement.rootAndDescendantsShareOneExecutionBudget,true);
  assert.equal(policy.continuousImprovement.slotExecutionMustRemainLowTrafficGated,true);
  assert.equal(policy.continuousImprovement.slotExecutionMustRemainServerLoadGated,true);
});

test('continuous site improvement is bound to the same recursive policy',()=>{
  const scheduler=read('ekodi-site-improvement-scheduler.js');
  assert.match(scheduler,/site-execution-enforcement\.json/);
  assert.match(scheduler,/Mandatory recursive site execution policy/);
  assert.match(scheduler,/every discoverable same-site subservice and site-owned admin surface/);
  assert.match(scheduler,/child surfaces may tighten but must not relax/);
});


test('canonical mount and descendant slash parity are forced inherited rules',()=>{
  const policy=json('config/site-execution-enforcement.json');
  assert.equal(policy.schemaVersion,4);
  assert.ok(policy.mandatoryContracts.includes('canonical-mount-parity'));
  assert.ok(policy.mandatoryContracts.includes('descendant-slash-parity'));
  const mount=policy.canonicalMountParity;
  assert.equal(mount.policyId,'CANONICAL-PATH-MOUNT-PARITY-001');
  assert.equal(mount.status,'enforced');
  assert.equal(mount.mode,'mandatory-recursive');
  assert.equal(mount.externalCanonicalAndInternalMountMustServeSameSurface,true);
  assert.equal(mount.descendantRouteSuffixMustBePreserved,true);
  assert.equal(mount.absoluteRootLinksForbiddenWhenTheyCanEscapeSiteMount,true);
  assert.equal(mount.authReturnMustPreserveInitiatingHostAndMount,true);
  assert.equal(mount.customerDomainMustNotCollapseToEkodiRootOrMy,true);
  assert.equal(mount.futureSitesAutoInherit,true);
  assert.equal(mount.perSiteOptOutAllowed,false);
  const seonam=mount.registeredMountPairs.find(item=>item.id==='seonammedi');
  assert.equal(seonam.externalBase,'https://seonammedi.kr');
  assert.equal(seonam.internalBase,'https://ekodi.kr/seonammedi');
  assert.deepEqual(seonam.descendantPaths,['/board/voices','/board/finance','/board/notices','/admin']);

  const slash=policy.descendantSlashParity;
  assert.equal(slash.policyId,'CANONICAL-ROUTE-SLASH-PARITY-001');
  assert.equal(slash.status,'enforced');
  assert.equal(slash.mode,'mandatory-recursive');
  assert.equal(slash.slashlessAndTrailingSlashMustResolveSameSurface,true);
  assert.equal(slash.sameAuthenticationRealmRequired,true);
  assert.equal(slash.sameAuthorizationContextRequired,true);
  assert.equal(slash.sameMountRequired,true);
  assert.equal(slash.sameCanonicalHostRequired,true);
  assert.equal(slash.contentDivergenceForbidden,true);
  assert.equal(slash.bothVariantsRegressionTestRequired,true);
  assert.equal(slash.futureSitesAutoInherit,true);
  assert.equal(slash.perSiteOptOutAllowed,false);
});
